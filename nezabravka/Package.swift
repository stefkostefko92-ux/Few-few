// swift-tools-version: 6.0
import PackageDescription

// Ядрото на „Незабравка“ е Foundation-only нарочно: същите файлове се компилират
// в iOS приложението (Xcode) и като SwiftPM пакет на Linux, за да могат
// сметките за повторения и планирането на известия да се тестват в CI без Mac.
let package = Package(
    name: "NezabravkaCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "NezabravkaCore", targets: ["NezabravkaCore"])
    ],
    targets: [
        .target(name: "NezabravkaCore", path: "Nezabravka/Core"),
        .testTarget(
            name: "NezabravkaCoreTests",
            dependencies: ["NezabravkaCore"],
            path: "Tests/NezabravkaCoreTests"
        ),
    ]
)
