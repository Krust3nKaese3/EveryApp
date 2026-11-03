package expo.modules.rawnet

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.CRC32
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Raw TCP/UDP + crypto primitives for macros (Tuya LAN etc.). All data crosses the bridge as lowercase hex. */
class ExpoRawNetModule : Module() {
  private val sockets = ConcurrentHashMap<Int, Socket>()
  private val nextId = AtomicInteger(1)

  private fun hex(b: ByteArray, len: Int = b.size) = buildString(len * 2) { for (i in 0 until len) append("%02x".format(b[i])) }
  private fun bytes(h: String): ByteArray {
    val s = h.replace(Regex("[^0-9a-fA-F]"), "")
    if (s.length % 2 != 0) throw IllegalArgumentException("Hex-String hat ungerade Länge")
    return ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  }
  private fun sock(id: Int) = sockets[id] ?: throw IllegalStateException("TCP-Socket $id ist nicht offen (schon geschlossen?)")

  override fun definition() = ModuleDefinition {
    Name("ExpoRawNet")

    OnDestroy { sockets.values.forEach { try { it.close() } catch (_: Exception) {} }; sockets.clear() }

    // ---------- TCP ----------
    AsyncFunction("tcpOpen") { host: String, port: Int, timeoutMs: Int ->
      val s = Socket()
      try { s.connect(InetSocketAddress(host, port), timeoutMs); s.tcpNoDelay = true }
      catch (e: Exception) { try { s.close() } catch (_: Exception) {}; throw IllegalStateException("TCP $host:$port nicht erreichbar: ${e.javaClass.simpleName}: ${e.message}") }
      val id = nextId.getAndIncrement(); sockets[id] = s; id
    }
    AsyncFunction("tcpSend") { id: Int, dataHex: String -> sock(id).getOutputStream().apply { write(bytes(dataHex)); flush() }; true }
    // Reads what arrives within timeoutMs (at least 1 byte, or "" on timeout). minBytes: keep reading until that many.
    AsyncFunction("tcpReceive") { id: Int, minBytes: Int, timeoutMs: Int ->
      val s = sock(id); val inp = s.getInputStream(); val out = ByteArrayOutputStream(); val buf = ByteArray(4096)
      val deadline = System.currentTimeMillis() + timeoutMs
      try {
        while (true) {
          val left = deadline - System.currentTimeMillis(); if (left <= 0) break
          s.soTimeout = left.toInt().coerceAtLeast(1)
          val n = inp.read(buf); if (n < 0) { if (out.size() == 0) throw IllegalStateException("TCP-Verbindung vom Gerät geschlossen"); break }
          out.write(buf, 0, n)
          if (out.size() >= maxOf(1, minBytes) && inp.available() == 0) break
        }
      } catch (_: SocketTimeoutException) {}
      hex(out.toByteArray())
    }
    AsyncFunction("tcpClose") { id: Int -> sockets.remove(id)?.let { try { it.close() } catch (_: Exception) {} }; true }

    // ---------- UDP ----------
    AsyncFunction("udpSend") { host: String, port: Int, dataHex: String, broadcast: Boolean ->
      DatagramSocket().use { s -> s.broadcast = broadcast; val d = bytes(dataHex); s.send(DatagramPacket(d, d.size, InetAddress.getByName(host), port)) }; true
    }
    // Listens on the given ports for durationMs; returns [{from, port, localPort, hex}] (max 200 packets)
    AsyncFunction("udpListen") { ports: List<Int>, durationMs: Int ->
      val ctx = appContext.reactContext
      val lock = (ctx?.applicationContext?.getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.createMulticastLock("everyapp-udp")?.apply { setReferenceCounted(false); acquire() }
      val result = java.util.Collections.synchronizedList(mutableListOf<Map<String, Any>>())
      val errors = mutableListOf<String>()
      val threads = ports.map { p -> Thread {
        try {
          DatagramSocket(null).use { s ->
            s.reuseAddress = true; s.broadcast = true; s.bind(InetSocketAddress(p))
            val end = System.currentTimeMillis() + durationMs; val buf = ByteArray(4096)
            while (System.currentTimeMillis() < end && result.size < 200) {
              s.soTimeout = (end - System.currentTimeMillis()).toInt().coerceAtLeast(1)
              val pk = DatagramPacket(buf, buf.size)
              try { s.receive(pk) } catch (_: SocketTimeoutException) { break }
              result.add(mapOf("from" to (pk.address?.hostAddress ?: ""), "port" to pk.port, "localPort" to p, "hex" to hex(pk.data, pk.length)))
            }
          }
        } catch (e: Exception) { synchronized(errors) { errors.add("Port $p: ${e.message}") } }
      }.apply { start() } }
      threads.forEach { it.join(durationMs + 2000L) }
      try { lock?.release() } catch (_: Exception) {}
      if (result.isEmpty() && errors.size == ports.size) throw IllegalStateException("UDP-Empfang fehlgeschlagen: ${errors.joinToString("; ")}")
      result.toList()
    }

    // ---------- crypto ----------
    AsyncFunction("aesEcb") { encrypt: Boolean, keyHex: String, dataHex: String ->
      val c = Cipher.getInstance("AES/ECB/NoPadding")
      c.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(bytes(keyHex), "AES"))
      hex(c.doFinal(bytes(dataHex)))
    }
    // encrypt: returns ciphertext+tag(16). decrypt: input ciphertext+tag, returns plaintext (throws on bad tag)
    AsyncFunction("aesGcm") { encrypt: Boolean, keyHex: String, ivHex: String, aadHex: String, dataHex: String ->
      val c = Cipher.getInstance("AES/GCM/NoPadding")
      c.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(bytes(keyHex), "AES"), GCMParameterSpec(128, bytes(ivHex)))
      if (aadHex.isNotEmpty()) c.updateAAD(bytes(aadHex))
      try { hex(c.doFinal(bytes(dataHex))) } catch (e: javax.crypto.AEADBadTagException) { throw IllegalStateException("AES-GCM: Tag ungültig (falscher Key?)") }
    }
    AsyncFunction("hmacSha256") { keyHex: String, dataHex: String ->
      val m = Mac.getInstance("HmacSHA256"); m.init(SecretKeySpec(bytes(keyHex), "HmacSHA256")); hex(m.doFinal(bytes(dataHex)))
    }
    AsyncFunction("md5") { dataHex: String -> hex(MessageDigest.getInstance("MD5").digest(bytes(dataHex))) }
    AsyncFunction("sha256") { dataHex: String -> hex(MessageDigest.getInstance("SHA-256").digest(bytes(dataHex))) }
    AsyncFunction("crc32") { dataHex: String -> CRC32().apply { update(bytes(dataHex)) }.value.toDouble() }
    AsyncFunction("randomHex") { n: Int -> hex(ByteArray(n).also { java.security.SecureRandom().nextBytes(it) }) }
  }
}
