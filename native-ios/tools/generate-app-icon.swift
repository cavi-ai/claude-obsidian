#!/usr/bin/env swift
import AppKit
import ImageIO
import UniformTypeIdentifiers

// Reproducible, opaque icon. Keep the app recognizable at small home-screen sizes.
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let target = root.appendingPathComponent("Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
let bitmap = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8,
    bytesPerRow: 4096, space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: bitmap, flipped: false)
NSColor(srgbRed: 0.09, green: 0.15, blue: 0.17, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
NSColor(srgbRed: 0.98, green: 0.96, blue: 0.92, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 180, y: 260, width: 664, height: 536), xRadius: 112, yRadius: 112).fill()
let tail = NSBezierPath()
tail.move(to: NSPoint(x: 268, y: 300))
tail.line(to: NSPoint(x: 268, y: 176))
tail.line(to: NSPoint(x: 432, y: 300))
tail.close(); tail.fill()
NSColor(srgbRed: 0.76, green: 0.43, blue: 0.31, alpha: 1).setFill()
func spark(x: CGFloat, y: CGFloat, radius: CGFloat) {
    let shape = NSBezierPath()
    let inner = radius * 0.28
    let points: [(CGFloat, CGFloat)] = [(0, radius), (inner, inner), (radius, 0),
        (inner, -inner), (0, -radius), (-inner, -inner), (-radius, 0), (-inner, inner)]
    shape.move(to: NSPoint(x: x + points[0].0, y: y + points[0].1))
    for point in points.dropFirst() { shape.line(to: NSPoint(x: x + point.0, y: y + point.1)) }
    shape.close(); shape.fill()
}
spark(x: 490, y: 518, radius: 144)
spark(x: 670, y: 678, radius: 52)
NSGraphicsContext.restoreGraphicsState()
try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
let data = NSMutableData()
guard let image = bitmap.makeImage(),
      let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)
else { fatalError("PNG encoding failed") }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("PNG encoding failed") }
try (data as Data).write(to: target, options: .atomic)
