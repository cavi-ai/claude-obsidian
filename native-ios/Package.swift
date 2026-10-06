// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "CompanionNativeCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [.library(name: "NativeCore", targets: ["NativeCore"])],
    targets: [
        .target(name: "NativeCore", path: "Sources/Core"),
        .testTarget(name: "NativeCoreTests", dependencies: ["NativeCore"], path: "Tests")
    ]
)
