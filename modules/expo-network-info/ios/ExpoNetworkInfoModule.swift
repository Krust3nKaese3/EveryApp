import ExpoModulesCore
import Darwin

/// Lokale IPv4-Adressen für den QR-Code. Kein Standort, kein WLAN-Name.
public class ExpoNetworkInfoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoNetworkInfo")

    AsyncFunction("getLanCandidates") { () -> [[String: String]] in
      Self.ipv4Candidates()
    }

    AsyncFunction("getInfo") { () -> [String: Any?] in
      let ip = Self.ipv4Candidates().first?["ip"]
      return [
        "transport": ip == nil ? "none" : "wifi",
        "ssid": nil,
        "ssidError": "SSID wird auf iOS nicht gelesen",
        "bssid": nil,
        "ip": ip as Any?,
        "prefixLength": nil,
        "gateway": nil,
        "dns": [String](),
        "interfaceName": Self.ipv4Candidates().first?["name"] as Any?,
      ]
    }

    AsyncFunction("getWifi") { () -> [String: Any?] in
      let ip = Self.ipv4Candidates().first?["ip"]
      return [
        "ip": ip as Any?,
        "ssid": nil,
        "bssid": nil,
        "rssi": nil,
        "frequency": nil,
        "linkSpeed": nil,
        "error": "SSID/BSSID werden auf iOS nicht gelesen",
      ]
    }
  }

  private static func ipv4Candidates() -> [[String: String]] {
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return [] }
    defer { freeifaddrs(ifaddr) }
    var rows: [[String: String]] = []
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let current = cursor {
      let iface = current.pointee
      let name = String(cString: iface.ifa_name)
      if let addr = iface.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET), !name.hasPrefix("lo") {
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST) == 0 {
          let ip = String(cString: hostname)
          if ip != "127.0.0.1" {
            rows.append(["name": name, "ip": ip])
          }
        }
      }
      cursor = iface.ifa_next
    }
    return rows
  }
}
