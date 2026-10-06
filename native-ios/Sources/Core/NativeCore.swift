import Foundation

public struct HandoffRequest: Codable, Sendable {
    public let version: Int
    public let id: String
    public let createdAt: Double
    public let expiresAt: Double
    public let vaultName: String
    public let sourcePath: String
    public let input: String
    public let instruction: String

    public func validate(now: Double) throws {
        guard version == 1, NativePolicy.validID(id), createdAt.isFinite, expiresAt.isFinite,
              createdAt > 0, createdAt <= now + 120, expiresAt > createdAt,
              expiresAt - createdAt <= 3_600, !vaultName.isEmpty, vaultName.utf16.count <= 256,
              sourcePath.utf16.count <= 1_024, input.utf16.count <= 12_000,
              !instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              instruction.utf16.count <= 1_200 else { throw NativeError.invalidRequest }
        guard expiresAt > now else { throw NativeError.expired }
    }
}

public enum NativePolicy {
    public static let maxFileBytes = 32_768
    public static let maxInputTokens = 2_048
    public static let maxOutputTokens = 512
    public static func validID(_ value: String) -> Bool {
        UUID(uuidString: value)?.uuidString.lowercased() == value
    }
    public static func requestPath(_ value: String, id: String) throws -> String {
        let parts = value.split(separator: "/", omittingEmptySubsequences: false)
        guard validID(id), !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }),
              !value.contains("\\"), !value.contains("\0"), value.utf8.count <= 2_048,
              value.hasSuffix("/plugins/claude-companion/native-jobs/\(id).request.json")
        else { throw NativeError.unsafePath }
        return value
    }
}

public enum NativeError: LocalizedError {
    case invalidRequest, expired, unsafePath, tooLarge, lowMemory, modelMissing, promptTooLong, invalidDownload, busy
    public var errorDescription: String? {
        switch self {
        case .invalidRequest: "Invalid native request. Send it again from Companion."
        case .expired: "This request expired. Send it again from Companion."
        case .unsafePath: "The request does not identify a valid job inside the selected vault."
        case .tooLarge: "The request or result exceeds the supported size. Select a shorter passage."
        case .lowMemory: "There is not enough available memory to load the model. Close other apps and try again."
        case .modelMissing: "Download the model before generating."
        case .promptTooLong: "The prompt exceeds 2,048 tokens. Select a shorter passage."
        case .invalidDownload: "The model download failed integrity verification. Retry the download."
        case .busy: "Wait for the current operation to finish or cancel it."
        }
    }
}

public struct ModelAsset: Codable, Sendable {
    public let path: String
    public let bytes: Int
    public let sha256: String
}

public struct LocalModel: Codable, Sendable {
    public let name: String
    public let repo: String
    public let revision: String
    public let license: String
    public let assets: [ModelAsset]
    public var downloadBytes: Int { assets.reduce(0) { $0 + $1.bytes } }
}

public struct HandoffResult: Codable, Sendable {
    public let version: Int
    public let id: String
    public let model: String
    public let revision: String
    public let output: String
    public let instruction: String
}
