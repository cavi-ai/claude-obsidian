import SwiftUI
import UIKit
import UniformTypeIdentifiers

@main
struct CompanionLocalApp: App {
    @StateObject private var state = NativeState()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                Form {
                    Section("On-device model") {
                        if let model = state.model {
                            Text(model.name)
                            Text("A one-time download of about \((model.downloadBytes + 999_999) / 1_000_000) MB. Inference runs on this device. Handoff files follow your vault’s sync settings.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Button(state.downloaded ? "Model downloaded" : "Download model", action: state.download)
                            .disabled(state.busy || state.downloaded || state.model == nil)
                        if state.downloaded { Button("Remove downloaded model", role: .destructive, action: state.clearModel).disabled(state.busy) }
                    }
                    Section("Obsidian vault") {
                        Button("Choose vault folder") { state.showVaultPicker = true }.disabled(state.busy)
                        Text("In Obsidian, select a passage and run “Send selection to on-device MLX”.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("Instruction") {
                        TextField("What should the model do?", text: $state.instruction, axis: .vertical).lineLimit(3...8).disabled(state.busy)
                        DisclosureGroup("Source text") { TextEditor(text: $state.input).frame(minHeight: 140).disabled(state.busy || state.hasRequest) }
                        Button("Generate on this device", action: state.generate)
                            .disabled(state.busy || !state.downloaded || state.instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if state.busy { Button("Cancel", role: .cancel, action: state.cancel) }
                    }
                    Section("Status") {
                        if state.busy { ProgressView() }
                        Text(state.status).font(.footnote)
                    }
                    if !state.output.isEmpty {
                        Section("Result") {
                            Text(state.output).textSelection(.enabled)
                            if state.hasRequest { Button("Send result to Obsidian", action: state.sendToObsidian).disabled(state.busy) }
                            ShareLink(item: state.output)
                        }
                    }
                }
                .navigationTitle("Companion Local")
                .sheet(isPresented: $state.showVaultPicker) { VaultPicker { state.selectVault($0) } }
                .onOpenURL { state.receive($0) }
                .onChange(of: phase) { _, value in if value == .background { state.cancel() } }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in state.cancel() }
            }
        }
    }
}

private struct VaultPicker: UIViewControllerRepresentable {
    let selected: (URL) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(selected: selected) }
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: UIDocumentPickerViewController, context: Context) {}
    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let selected: (URL) -> Void
        init(selected: @escaping (URL) -> Void) { self.selected = selected }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            if let url = urls.first { selected(url) }
        }
    }
}
