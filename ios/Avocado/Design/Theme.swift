import CoreText
import SwiftUI
import UIKit

/// Tokens del kit "Fresco" (ui/src/styles.css).
enum Theme {
    static let ground = Color(hex: 0xF5F7F2)
    static let surface = Color.white
    static let sunken = Color(hex: 0xEEF2EB)
    static let ink = Color(hex: 0x18221B)
    static let muted = Color(hex: 0x56645A)
    static let line = Color(hex: 0xE2E7DF)

    static let accent = Color(hex: 0x2F7A3A)
    static let accentStrong = Color(hex: 0x215A29)
    static let accentSoft = Color(hex: 0xE4EFDD)

    static let danger = Color(hex: 0xB3361F)
    static let dangerSoft = Color(hex: 0xFBE4DE)
    static let warningInk = Color(hex: 0x7A4B00)
    static let warningSoft = Color(hex: 0xFBF1DD)
    static let orange = Color(hex: 0xEE8E3E)

    static let radius: CGFloat = 22
    static let gutter: CGFloat = 16
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Bricolage Grotesque (la de la marca) para títulos y números grandes; el resto usa la fuente del sistema.
enum BrandFont {
    private static let postScriptName = "BricolageGrotesque96ptExtraBold-Regular"

    static func register() {
        guard let url = Bundle.main.url(forResource: "BricolageGrotesque", withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }

    /// `weight` va de 200 a 800 (eje "wght" de la fuente variable). Escala con el tamaño de texto del sistema.
    static func uiFont(_ size: CGFloat, weight: CGFloat, relativeTo style: UIFont.TextStyle) -> UIFont {
        let wght = 0x7767_6874 // "wght"
        let descriptor = UIFontDescriptor(fontAttributes: [
            .name: postScriptName,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [wght: weight],
        ])
        let base = UIFont(descriptor: descriptor, size: size)
        return UIFontMetrics(forTextStyle: style).scaledFont(for: base)
    }
}

extension Font {
    static func display(_ size: CGFloat, weight: CGFloat = 700, relativeTo style: UIFont.TextStyle = .title1) -> Font {
        Font(BrandFont.uiFont(size, weight: weight, relativeTo: style) as CTFont)
    }
}
