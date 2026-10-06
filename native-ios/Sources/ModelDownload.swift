import CryptoKit
import Foundation

actor ModelDownload {
    let model: LocalModel
    let directory: URL

    init(model: LocalModel) throws {
        self.model = model
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true)
        directory = base.appendingPathComponent("Models/\(model.revision)", isDirectory: true)
    }

    func ready() -> Bool {
        let marker = directory.appendingPathComponent("verified")
        guard (try? String(contentsOf: marker, encoding: .utf8)) == model.revision else { return false }
        return model.assets.allSatisfy { asset in
            let attrs = try? FileManager.default.attributesOfItem(atPath: directory.appendingPathComponent(asset.path).path)
            return (attrs?[.size] as? NSNumber)?.intValue == asset.bytes
        }
    }

    func download(status: @Sendable (String) async -> Void) async throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var dir = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try dir.setResourceValues(values)
        for asset in model.assets {
            try Task.checkCancellation()
            let target = directory.appendingPathComponent(asset.path)
            if try matches(target, asset: asset) { continue }
            await status("Downloading \(asset.path)…")
            let url = URL(string: "https://huggingface.co/\(model.repo)/resolve/\(model.revision)/\(asset.path)")!
            let (temporary, response) = try await URLSession.shared.download(from: url)
            defer { try? FileManager.default.removeItem(at: temporary) }
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  try matches(temporary, asset: asset) else { throw NativeError.invalidDownload }
            try Task.checkCancellation()
            if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
            try FileManager.default.moveItem(at: temporary, to: target)
        }
        try Task.checkCancellation()
        try Data(model.revision.utf8).write(to: directory.appendingPathComponent("verified"), options: .atomic)
    }

    func clear() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    private func matches(_ url: URL, asset: ModelAsset) throws -> Bool {
        guard FileManager.default.fileExists(atPath: url.path) else { return false }
        let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        guard (attrs[.size] as? NSNumber)?.intValue == asset.bytes else { return false }
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var hash = SHA256()
        while let chunk = try file.read(upToCount: 1_048_576), !chunk.isEmpty {
            try Task.checkCancellation()
            hash.update(data: chunk)
        }
        return hash.finalize().map { String(format: "%02x", $0) }.joined() == asset.sha256
    }
}
