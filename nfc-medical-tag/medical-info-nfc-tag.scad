// ============================================================
//  Medical Info NFC Tag  -  parametric, print-ready
//  Round key-fob with raised "MEDICAL" / "INFO" lettering and
//  a central medical cross, plus a recess on the back to glue
//  a standard round NFC sticker (e.g. NTAG215 25 mm).
//
//  Two-colour (red cross/text + body) is achieved with a single
//  filament swap / pause.  See README.md for orientation & the
//  exact swap height.
//
//  Units: millimetres.   Author-tunable parameters below.
// ============================================================

/* [ Main body ] */
disc_d        = 40;    // tag diameter
base_h        = 3.6;   // disc thickness (without the raised relief)
relief_h      = 1.0;   // height of the raised text + cross (the "red" layer)
edge_border   = true;  // raised ring framing the face

/* [ NFC pocket on the back ] */
nfc_pocket    = true;
nfc_d         = 26;    // pocket diameter  (25 mm tag + ~1 mm clearance)
nfc_depth     = 1.2;   // pocket depth     (fits thin stickers and coin tags)

/* [ Keyring loop ] */
loop_outer_d  = 11;
loop_hole_d   = 5;
loop_offset   = 4;     // how far the loop centre sits beyond the disc edge

/* [ Lettering ] */
font          = "Liberation Sans:style=Bold";
top_text      = "MEDICAL";
bottom_text   = "INFO";
top_size      = 5.2;
bottom_size   = 5.2;
text_radius   = 14.4;  // radius of the text baseline circle
top_spacing   = 22;    // degrees between letters (top arc)
bottom_spacing= 22;    // degrees between letters (bottom arc)

/* [ Central cross ] */
cross_arm     = 15;    // full length of each cross bar
cross_w       = 5.2;   // thickness of the cross bars

/* [ "NFC" mark engraved into the cross ] */
center_text   = "NFC"; // engraved into the cross ("" to hide)
center_size   = 3.0;
center_y      = -1.0;  // vertical position inside the cross

/* [ Quality ] */
$fn           = 160;

eps = 0.01;

// ---- one letter placed on a circle ----
//  inward=false : letter "up" points radially OUTWARD (top arc)
//  inward=true  : letter "up" points radially INWARD  (bottom arc),
//                 so the text still reads upright on the upright tag.
module letter_on_arc(ch, ang, r, size, inward) {
    rotate([0, 0, ang - 90])
        translate([0, r, 0])
            rotate([0, 0, inward ? 180 : 0])
                linear_extrude(height = relief_h + eps)
                    text(ch, size = size, font = font,
                         halign = "center", valign = "center");
}

// ---- spread a string along an arc, centred on center_deg ----
module curved_text(txt, r, size, spacing, center_deg, inward = false) {
    n = len(txt);
    sgn = inward ? 1 : -1;          // keep left-to-right reading on both arcs
    for (i = [0 : n - 1]) {
        ang = center_deg + sgn * (i - (n - 1) / 2) * spacing;
        letter_on_arc(txt[i], ang, r, size, inward);
    }
}

// ---- the raised medical cross ----
module cross() {
    linear_extrude(height = relief_h + eps)
        union() {
            square([cross_arm, cross_w], center = true);
            square([cross_w, cross_arm], center = true);
        }
}

// ---- raised border ring ----
module border() {
    linear_extrude(height = relief_h + eps)
        difference() {
            circle(d = disc_d - 2.2);
            circle(d = disc_d - 2.2 - 1.6);
        }
}

// ---- keyring loop ----
module loop() {
    cy = disc_d / 2 + loop_offset;
    difference() {
        translate([0, cy, 0])
            cylinder(d = loop_outer_d, h = base_h);
        translate([0, cy, -eps])
            cylinder(d = loop_hole_d, h = base_h + 2 * eps);
    }
}

// ====================  ASSEMBLY  ====================
// Modelled FRONT-UP: face/relief on +Z, NFC pocket on -Z.
// For printing, flip text-down (see README).

// All the raised lettering + cross + border (the "red" colour),
// with "NFC" engraved straight through the cross so the body colour
// shows inside it.
module tag_relief() {
    translate([0, 0, base_h - eps])
        difference() {
            union() {
                curved_text(top_text,    text_radius, top_size,
                            top_spacing,    90);                    // top arc
                curved_text(bottom_text, text_radius, bottom_size,
                            bottom_spacing, 270, inward = true);    // bottom arc
                cross();
                if (edge_border) border();
            }
            // engrave NFC through the full relief thickness
            if (center_text != "")
                translate([0, center_y, -eps])
                    linear_extrude(height = relief_h + 3 * eps)
                        text(center_text, size = center_size, font = font,
                             halign = "center", valign = "center");
        }
}

// Disc + keyring loop with the loop hole and NFC pocket removed.
module tag_body() {
    cy = disc_d / 2 + loop_offset;
    difference() {
        union() {
            cylinder(d = disc_d, h = base_h);
            loop();
        }
        translate([0, cy, -eps])
            cylinder(d = loop_hole_d, h = base_h + relief_h + 2 * eps);
        if (nfc_pocket)
            translate([0, 0, -eps])
                cylinder(d = nfc_d, h = nfc_depth + eps);
    }
}

module tag() {
    tag_body();
    tag_relief();
}

tag();
