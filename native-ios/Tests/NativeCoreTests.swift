import Foundation
import XCTest
@testable import NativeCore

final class NativeCoreTests: XCTestCase {
    let id = "11111111-2222-4333-8444-555555555555"

    func request(id: String? = nil, input: String = "A source paragraph.", expiresAt: Double = 3_700) -> HandoffRequest {
        HandoffRequest(version: 1, id: id ?? self.id, createdAt: 100, expiresAt: expiresAt,
            vaultName: "Research", sourcePath: "Note.md", input: input, instruction: "Summarize this paragraph.")
    }

    func testAcceptsAnExplicitBoundedRequest() throws {
        try request().validate(now: 101)
    }

    func testRejectsExpiredAndUnboundedRequests() {
        XCTAssertThrowsError(try request().validate(now: 3_701))
        XCTAssertThrowsError(try request(expiresAt: 100_000).validate(now: 101))
        XCTAssertThrowsError(try request(id: "../other").validate(now: 101))
        XCTAssertThrowsError(try request(input: String(repeating: "a", count: 12_001)).validate(now: 101))
        // Match JavaScript string lengths across the handoff boundary.
        XCTAssertThrowsError(try request(input: String(repeating: "😀", count: 6_001)).validate(now: 101))
    }

    func testRequestLocatorCannotEscapeVaultOrSelectAnotherJob() throws {
        let valid = ".obsidian/plugins/claude-companion/native-jobs/\(id).request.json"
        XCTAssertEqual(try NativePolicy.requestPath(valid, id: id), valid)
        for path in ["/" + valid, "../" + valid, valid.replacingOccurrences(of: ".obsidian/", with: ".obsidian/../"),
                     valid.replacingOccurrences(of: id, with: "99999999-2222-4333-8444-555555555555")] {
            XCTAssertThrowsError(try NativePolicy.requestPath(path, id: id))
        }
    }
}
