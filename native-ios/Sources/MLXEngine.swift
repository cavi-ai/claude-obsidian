import Foundation
import MLX
import MLXLLM
import MLXLMCommon
import Tokenizers
import os

/// One foreground generation at a time. The generation producer is joined
/// before this actor releases its model or admits the next request.
actor MLXEngine {
    private var running = false

    func generate(directory: URL, instruction: String, input: String) async throws -> String {
        guard !running else { throw NativeError.busy }
        running = true
        defer { running = false; Memory.clearCache() }
        try Task.checkCancellation()
        let available = os_proc_available_memory()
        guard available >= 1_073_741_824 else { throw NativeError.lowMemory }
        Memory.cacheLimit = 16 * 1_024 * 1_024
        Memory.memoryLimit = min(1_500_000_000, Int(available) * 3 / 4)
        let context = try await LLMModelFactory.shared.load(from: directory, using: LocalTokenizerLoader())
        try Task.checkCancellation()
        let prompt = input.isEmpty ? instruction : "Instruction: \(instruction)\n\nSource text:\n\(input)"
        let prepared = try await context.processor.prepare(input: UserInput(chat: [
            .init(role: .system, content: "You are a private writing assistant. Follow the user's instruction. When source text is provided, preserve its facts and do not invent citations. Return the answer directly."),
            .init(role: .user, content: prompt)
        ], additionalContext: ["enable_thinking": false]))
        guard prepared.text.tokens.size <= NativePolicy.maxInputTokens else { throw NativeError.promptTooLong }
        try Task.checkCancellation()
        let parameters = GenerateParameters(maxTokens: NativePolicy.maxOutputTokens, temperature: 0.3, prefill: .init(stepSize: 128))
        let iterator = try TokenIterator(input: prepared, model: context.model, parameters: parameters)
        let (stream, producer) = generateTask(promptTokenCount: prepared.text.tokens.size,
            modelConfiguration: context.configuration, tokenizer: context.tokenizer, iterator: iterator)
        return try await withTaskCancellationHandler {
            var output = ""
            var overflow = false
            for await event in stream {
                if Task.isCancelled { producer.cancel(); break }
                if case .chunk(let text) = event { output += text }
                if output.utf8.count > 16_384 { overflow = true; producer.cancel(); break }
            }
            producer.cancel()
            await producer.value
            try Task.checkCancellation()
            if overflow { throw NativeError.tooLarge }
            guard !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeError.invalidRequest }
            return output
        } onCancel: {
            producer.cancel()
        }
    }
}

/// Only loads the explicitly downloaded local tokenizer; no hub downloader.
private struct LocalTokenizerLoader: MLXLMCommon.TokenizerLoader {
    func load(from directory: URL) async throws -> any MLXLMCommon.Tokenizer {
        LocalTokenizer(upstream: try await AutoTokenizer.from(modelFolder: directory))
    }
}

private struct LocalTokenizer: MLXLMCommon.Tokenizer {
    let upstream: any Tokenizers.Tokenizer
    func encode(text: String, addSpecialTokens: Bool) -> [Int] { upstream.encode(text: text, addSpecialTokens: addSpecialTokens) }
    func decode(tokenIds: [Int], skipSpecialTokens: Bool) -> String { upstream.decode(tokens: tokenIds, skipSpecialTokens: skipSpecialTokens) }
    func convertTokenToId(_ token: String) -> Int? { upstream.convertTokenToId(token) }
    func convertIdToToken(_ id: Int) -> String? { upstream.convertIdToToken(id) }
    var bosToken: String? { upstream.bosToken }
    var eosToken: String? { upstream.eosToken }
    var unknownToken: String? { upstream.unknownToken }
    func applyChatTemplate(messages: [[String: any Sendable]], tools: [[String: any Sendable]]?, additionalContext: [String: any Sendable]?) throws -> [Int] {
        do { return try upstream.applyChatTemplate(messages: messages, tools: tools, additionalContext: additionalContext) }
        catch Tokenizers.TokenizerError.missingChatTemplate { throw MLXLMCommon.TokenizerError.missingChatTemplate }
    }
}
