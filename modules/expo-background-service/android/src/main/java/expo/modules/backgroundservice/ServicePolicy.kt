package expo.modules.backgroundservice

/**
 * Keep in sync with src/services/backgroundPolicy.ts.
 * Wifi watchers never count. Only interval triggers and bleNotify subs that are
 * due or connected keep the foreground service.
 */
object ServicePolicy {
  const val WIFI_DEBOUNCE_MS = 30_000L
  const val BLE_MAX_ATTEMPTS = 10
  const val BLE_BACKOFF_CAP_MS = 5 * 60 * 1000L
  const val BLE_BACKOFF_BASE_MS = 1000L
  const val MIN_INTERVAL_MS = 15_000L

  fun bleBackoffMs(attempt: Int): Long {
    val n = attempt.coerceAtLeast(1)
    val shift = (n - 1).coerceAtMost(16)
    val raw = BLE_BACKOFF_BASE_MS shl shift
    return raw.coerceAtMost(BLE_BACKOFF_CAP_MS)
  }

  fun bleShouldRetry(attempt: Int): Boolean = attempt < BLE_MAX_ATTEMPTS

  data class Counts(
    val intervalCount: Int,
    val dueOrConnectedBle: Int,
    val waitingBle: Int,
    val exhaustedBle: Int,
    val wifiWatchers: Int,
  )

  fun needsForeground(counts: Counts): Boolean =
    counts.intervalCount > 0 || counts.dueOrConnectedBle > 0

  fun reasons(counts: Counts): List<String> {
    val out = mutableListOf<String>()
    if (counts.intervalCount > 0) out.add("interval")
    if (counts.dueOrConnectedBle > 0) out.add("bleNotify")
    return out
  }

  fun decisionLine(source: String, counts: Counts, running: Boolean): String {
    val needed = needsForeground(counts)
    val why = if (needed) "Gründe: ${reasons(counts).joinToString(", ")}"
    else "Gründe: keine interval-Trigger und kein fälliges/verbundenes bleNotify"
    val action = when {
      needed && running -> "DIENST BLEIBT AN"
      needed && !running -> "DIENST START"
      !needed && running -> "DIENST STOPP"
      else -> "DIENST BLEIBT AUS"
    }
    return "$action | $why | interval=${counts.intervalCount} bleFälligOderVerbunden=${counts.dueOrConnectedBle} bleWartetBackoff=${counts.waitingBle} bleErschöpft=${counts.exhaustedBle} wifiWatcher=${counts.wifiWatchers} (WLAN ohne Vordergrunddienst) | Quelle: $source"
  }
}
