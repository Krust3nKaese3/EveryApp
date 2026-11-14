import ExpoModulesCore
import Foundation

/// Bonjour für einen schon offenen TCP-Port. Kein zweiter Listener.
/// TXT kommt aus JS. Dieses Modul fügt kein Token hinzu.
public class ExpoMdnsModule: Module {
  private var published: NetService?
  private var browser: NetServiceBrowser?
  private var delegate: BrowserDelegate?

  public func definition() -> ModuleDefinition {
    Name("ExpoMdns")
    Events("services")

    AsyncFunction("publish") { (name: String, port: Int, txt: [String: String]) in
      self.published?.stop()
      let service = NetService(domain: "local.", type: "_everyapp._tcp.", name: String(name.prefix(50)), port: Int32(port))
      var record: [String: Data] = [:]
      for (key, value) in txt where key.count <= 9 {
        record[key] = Data(value.utf8)
      }
      service.setTXTRecord(NetService.data(fromTXTRecord: record))
      service.publish()
      self.published = service
    }

    AsyncFunction("unpublish") {
      self.published?.stop()
      self.published = nil
    }

    AsyncFunction("browse") {
      self.browser?.stop()
      let browser = NetServiceBrowser()
      let delegate = BrowserDelegate { [weak self] payload in
        self?.sendEvent("services", payload)
      }
      browser.delegate = delegate
      self.delegate = delegate
      self.browser = browser
      browser.searchForServices(ofType: "_everyapp._tcp.", inDomain: "local.")
    }

    AsyncFunction("stopBrowse") {
      self.browser?.stop()
      self.browser = nil
      self.delegate = nil
    }
  }
}

private final class BrowserDelegate: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private let emit: ([String: Any]) -> Void
  private var resolving: [NetService] = []

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    service.delegate = self
    resolving.append(service)
    service.resolve(withTimeout: 5)
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    emit(["present": false, "key": service.name])
  }

  func netServiceDidResolveAddress(_ sender: NetService) {
    let host = Self.privateIPv4(sender) ?? ""
    let port = Int(sender.port)
    guard !host.isEmpty, port > 0 else { return }
    var txt: [String: String] = [:]
    if let data = sender.txtRecordData(), let parsed = NetService.dictionary(fromTXTRecord: data) as? [String: Data] {
      for (key, value) in parsed {
        txt[key] = String(data: value, encoding: .utf8) ?? ""
      }
    }
    emit([
      "present": true,
      "key": "\(sender.name)|\(host):\(port)",
      "host": host,
      "port": port,
      "txt": txt,
    ])
  }

  private static func privateIPv4(_ service: NetService) -> String? {
    for address in service.addresses ?? [] {
      let ip: String? = address.withUnsafeBytes { raw in
        guard let pointer = raw.baseAddress?.assumingMemoryBound(to: sockaddr.self) else { return nil }
        guard pointer.pointee.sa_family == UInt8(AF_INET) else { return nil }
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let len = socklen_t(address.count)
        guard getnameinfo(pointer, len, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { return nil }
        return String(cString: host)
      }
      if let ip, Self.isPrivate(ip) { return ip }
    }
    return nil
  }

  private static func isPrivate(_ host: String) -> Bool {
    let parts = host.split(separator: ".")
    guard parts.count == 4, let a = Int(parts[0]), let b = Int(parts[1]) else { return false }
    if a == 10 { return true }
    if a == 192 && b == 168 { return true }
    if a == 172 && b >= 16 && b <= 31 { return true }
    if a == 169 && b == 254 && host != "169.254.169.254" { return true }
    return false
  }
}
