import Combine
import Foundation
import UIKit

@MainActor
final class NativeState: ObservableObject {
    @Published var model: LocalModel?
    @Published var downloaded = false
    @Published var busy = false
    @Published var status = "Select a vault to receive passages from Companion."
    @Published var instruction = ""
    @Published var input = ""
    @Published var output = ""
    @Published var showVaultPicker = false
    private var operation: Task<Void, Never>?
    private var downloadStore: ModelDownload?
    private let engine = MLXEngine()
    private let handoff = VaultHandoff()
    private var request: HandoffRequest?
    private var pendingURL: URL?
    private var generatedInstruction = ""
    var hasRequest: Bool { request != nil }

    init() {
        do {
            guard let url = Bundle.main.url(forResource: "Model", withExtension: "json") else { throw NativeError.modelMissing }
            let value = try JSONDecoder().decode(LocalModel.self, from: Data(contentsOf: url))
            model = value
            downloadStore = try ModelDownload(model: value)
            Task { downloaded = await downloadStore?.ready() ?? false }
        } catch { status = error.localizedDescription }
    }

    func receive(_ url: URL) {
        guard !busy else { status = NativeError.busy.localizedDescription; return }
        pendingURL = url
        request = nil; output = ""
        do {
            let value = try handoff.read(url)
            request = value; instruction = value.instruction; input = value.input; output = ""
            pendingURL = nil
            status = "Received a passage from \(value.sourcePath). Review the instruction, then generate."
        } catch { status = "\(error.localizedDescription) Choose the matching Obsidian vault folder, then retry." }
    }

    func selectVault(_ url: URL) {
        do {
            try handoff.select(url)
            request = nil; output = ""
            status = "Vault selected: \(url.lastPathComponent)."
            if let pendingURL { receive(pendingURL) }
        } catch { status = error.localizedDescription }
    }

    func download() {
        guard !busy, let downloadStore else { return }
        start {
            try await downloadStore.download { [weak self] text in await self?.setStatus(text) }
            self.downloaded = await downloadStore.ready()
            self.status = "Model downloaded and verified. Generation runs on this device."
        }
    }

    func generate() {
        guard !busy, let downloadStore, !instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard instruction.utf16.count <= 1_200, input.utf16.count <= 12_000 else { status = NativeError.tooLarge.localizedDescription; return }
        let instruction = instruction, input = input
        output = ""
        start {
            guard await downloadStore.ready() else { throw NativeError.modelMissing }
            self.status = "Generating on this device…"
            self.output = try await self.engine.generate(directory: downloadStore.directory, instruction: instruction, input: input)
            self.generatedInstruction = instruction
            self.status = "Generated locally. Review the result before sending it to Obsidian."
        }
    }

    func sendToObsidian() {
        guard !busy, let request, let model, !output.isEmpty else { return }
        do {
            let result = HandoffResult(version: 1, id: request.id, model: model.repo, revision: model.revision, output: output, instruction: generatedInstruction)
            let url = try handoff.write(result, request: request)
            UIApplication.shared.open(url) { [weak self] opened in
                Task { @MainActor in
                    if !opened { self?.status = "Install Obsidian to import this result." }
                }
            }
        } catch { status = error.localizedDescription }
    }

    func clearModel() {
        guard !busy, let downloadStore else { return }
        start {
            try await downloadStore.clear()
            self.downloaded = false
            self.status = "Downloaded model removed."
        }
    }

    func cancel() {
        operation?.cancel()
        if busy { status = "Cancelling…" }
    }

    private func setStatus(_ text: String) { status = text }
    private func start(_ action: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        busy = true
        operation = Task {
            defer { busy = false; operation = nil }
            do { try await action() }
            catch is CancellationError { status = "Cancelled. Model inference is paused." }
            catch { status = Task.isCancelled ? "Cancelled." : error.localizedDescription }
        }
    }
}
