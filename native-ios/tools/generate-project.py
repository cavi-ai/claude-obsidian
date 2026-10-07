#!/usr/bin/env python3
"""Generate the native app's deterministic Xcode project; no signing team is embedded."""
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
def ident(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()

sources = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "Sources").rglob("*.swift"))
assets = ["Resources/Model.json", "Resources/Assets.xcassets"]
packages = {
    "mlx-swift-lm": ("https://github.com/ml-explore/mlx-swift-lm", "3.32.3"),
    "mlx-swift": ("https://github.com/ml-explore/mlx-swift", "0.32.3"),
    "swift-transformers": ("https://github.com/huggingface/swift-transformers", "1.3.4"),
}
products = {"MLXLLM": "mlx-swift-lm", "MLXLMCommon": "mlx-swift-lm", "MLX": "mlx-swift", "Tokenizers": "swift-transformers"}
objects = []
def add(key, body):
    objects.append(f"{ident(key)} = {{ {body} }};")
def refs(keys):
    return "(" + ", ".join(ident(k) for k in keys) + ",)"

for path in sources + assets:
    kind = "sourcecode.swift" if path.endswith(".swift") else "folder.assetcatalog" if path.endswith(".xcassets") else "text.json"
    add(path, f'isa = PBXFileReference; lastKnownFileType = {kind}; path = "{path}"; sourceTree = "<group>";')
    add("build:" + path, f"isa = PBXBuildFile; fileRef = {ident(path)};")
for name, (url, version) in packages.items():
    add("package:" + name, f'isa = XCRemoteSwiftPackageReference; repositoryURL = "{url}"; requirement = {{ kind = exactVersion; version = {version}; }};')
for name, package in products.items():
    add("product:" + name, f"isa = XCSwiftPackageProductDependency; package = {ident('package:' + package)}; productName = {name};")
    add("link:" + name, f"isa = PBXBuildFile; productRef = {ident('product:' + name)};")
add("app", 'isa = PBXFileReference; explicitFileType = wrapper.application; path = "CompanionLocal.app"; sourceTree = BUILT_PRODUCTS_DIR;')
add("products", f'isa = PBXGroup; name = Products; children = {refs(["app"])}; sourceTree = "<group>";')
add("root", f'isa = PBXGroup; children = {refs(sources + assets + ["products"])}; sourceTree = "<group>";')
add("sources", f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {refs(["build:" + p for p in sources])}; runOnlyForDeploymentPostprocessing = 0;')
add("resources", f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = {refs(["build:" + p for p in assets])}; runOnlyForDeploymentPostprocessing = 0;')
add("frameworks", f'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = {refs(["link:" + p for p in products])}; runOnlyForDeploymentPostprocessing = 0;')
for mode in ["Debug", "Release"]:
    add("project:" + mode, f'isa = XCBuildConfiguration; name = {mode}; buildSettings = {{ CLANG_ENABLE_MODULES = YES; SDKROOT = iphoneos; SWIFT_VERSION = 6.0; IPHONEOS_DEPLOYMENT_TARGET = 17.0; }};')
    optimization = '"-Onone"' if mode == "Debug" else '"-O"'
    add("target:" + mode, f'isa = XCBuildConfiguration; name = {mode}; buildSettings = {{ PRODUCT_NAME = CompanionLocal; PRODUCT_BUNDLE_IDENTIFIER = ai.cavi.companion.local; INFOPLIST_FILE = Info.plist; ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 0.1.0; TARGETED_DEVICE_FAMILY = 1; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; SWIFT_OPTIMIZATION_LEVEL = {optimization}; ENABLE_PREVIEWS = YES; }};')
for scope in ["project", "target"]:
    add("configs:" + scope, f'isa = XCConfigurationList; buildConfigurations = {refs([scope + ":Debug", scope + ":Release"])}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
add("target", f'isa = PBXNativeTarget; name = CompanionLocal; buildConfigurationList = {ident("configs:target")}; buildPhases = {refs(["sources", "frameworks", "resources"])}; buildRules = (); dependencies = (); packageProductDependencies = {refs(["product:" + p for p in products])}; productName = CompanionLocal; productReference = {ident("app")}; productType = "com.apple.product-type.application";')
add("project", f'isa = PBXProject; attributes = {{ BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 2700; }}; buildConfigurationList = {ident("configs:project")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en, Base); mainGroup = {ident("root")}; productRefGroup = {ident("products")}; projectDirPath = ""; projectRoot = ""; packageReferences = {refs(["package:" + p for p in packages])}; targets = {refs(["target"])};')
project = ROOT / "CompanionLocal.xcodeproj"
project.mkdir(exist_ok=True)
(project / "project.pbxproj").write_text("// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n" + "\n".join(objects) + f"\n}}; rootObject = {ident('project')}; }}\n")
scheme = project / "xcshareddata/xcschemes"
scheme.mkdir(parents=True, exist_ok=True)
(scheme / "CompanionLocal.xcscheme").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2700" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForRunning="YES" buildForTesting="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ident('target')}" BuildableName="CompanionLocal.app" BlueprintName="CompanionLocal" ReferencedContainer="container:CompanionLocal.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug"/>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ident('target')}" BuildableName="CompanionLocal.app" BlueprintName="CompanionLocal" ReferencedContainer="container:CompanionLocal.xcodeproj"/></BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
