import Foundation

@MainActor
final class VaultHandoff {
    private let bookmarkKey = "selectedVaultBookmark"
    private(set) var requestPath: String?

    func select(_ url: URL) throws {
        guard url.startAccessingSecurityScopedResource() else { throw NativeError.unsafePath }
        defer { url.stopAccessingSecurityScopedResource() }
        let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        UserDefaults.standard.set(bookmark, forKey: bookmarkKey)
    }

    func read(_ url: URL) throws -> HandoffRequest {
        guard url.scheme == "cavi-companion", url.host == "handoff",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.count == 2, Set(items.map(\.name)) == Set(["id", "request"]),
              let id = items.first(where: { $0.name == "id" })?.value,
              let path = items.first(where: { $0.name == "request" })?.value
        else { throw NativeError.invalidRequest }
        _ = try NativePolicy.requestPath(path, id: id)
        let request: HandoffRequest = try withVault { root in
            let file = try child(root, path: path)
            var result: Result<HandoffRequest, Error> = .failure(NativeError.invalidRequest)
            var coordinationError: NSError?
            NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &coordinationError) { readable in
                result = Result {
                    let attrs = try FileManager.default.attributesOfItem(atPath: readable.path)
                    guard ((attrs[.size] as? NSNumber)?.intValue ?? Int.max) <= NativePolicy.maxFileBytes else { throw NativeError.tooLarge }
                    let data = try Data(contentsOf: readable, options: .mappedIfSafe)
                    guard data.count <= NativePolicy.maxFileBytes else { throw NativeError.tooLarge }
                    let value = try JSONDecoder().decode(HandoffRequest.self, from: data)
                    try value.validate(now: Date().timeIntervalSince1970)
                    guard value.id == id, value.vaultName == root.lastPathComponent else { throw NativeError.invalidRequest }
                    return value
                }
            }
            if let coordinationError { throw coordinationError }
            return try result.get()
        }
        requestPath = path
        return request
    }

    func write(_ result: HandoffResult, request: HandoffRequest) throws -> URL {
        try request.validate(now: Date().timeIntervalSince1970)
        guard result.id == request.id, !result.output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              result.output.utf8.count <= 16_384, let requestPath else { throw NativeError.invalidRequest }
        let data = try JSONEncoder().encode(result)
        guard data.count <= NativePolicy.maxFileBytes else { throw NativeError.tooLarge }
        try withVault { root in
            guard root.lastPathComponent == request.vaultName else { throw NativeError.invalidRequest }
            let path = String(requestPath.dropLast(".request.json".count)) + ".result.json"
            let target = try child(root, path: path)
            var coordinationError: NSError?
            var writeError: Error?
            NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: &coordinationError) { writable in
                do { try data.write(to: writable, options: .atomic) }
                catch { writeError = error }
            }
            if let coordinationError { throw coordinationError }
            if let writeError { throw writeError }
        }
        var components = URLComponents()
        components.scheme = "obsidian"; components.host = "claude-companion-native-result"
        components.queryItems = [URLQueryItem(name: "vault", value: request.vaultName), URLQueryItem(name: "id", value: request.id)]
        guard let url = components.url else { throw NativeError.invalidRequest }
        return url
    }

    private func withVault<T>(_ action: (URL) throws -> T) throws -> T {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { throw NativeError.unsafePath }
        var stale = false
        let root = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
        guard root.startAccessingSecurityScopedResource() else { throw NativeError.unsafePath }
        defer { root.stopAccessingSecurityScopedResource() }
        if stale { try select(root) }
        return try action(root)
    }

    private func child(_ root: URL, path: String) throws -> URL {
        let base = root.resolvingSymlinksInPath().standardizedFileURL
        let file = base.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(base.path + "/") else { throw NativeError.unsafePath }
        return file
    }
}
