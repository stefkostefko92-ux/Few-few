// swift-tools-version: 6.0
import PackageDescription

// Ядрото на „Каракочев“ е Foundation-only нарочно: същите файлове се компилират
// в iOS приложението (Xcode) и като SwiftPM пакет на Linux, за да могат
// сметките за повторения и планирането на известия да се тестват в CI без Mac.
let package = Package(
    name: "KarakochevCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KarakochevCore", targets: ["KarakochevCore"])
    ],
    targets: [
        .target(name: "KarakochevCore", path: "Karakochev/Core"),
        .testTarget(
            name: "KarakochevCoreTests",
            dependencies: ["KarakochevCore"],
            path: "Tests/KarakochevCoreTests"
        ),
    ]
)
