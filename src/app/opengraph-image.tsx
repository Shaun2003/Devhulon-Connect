import { ImageResponse } from "next/og";
import { SITE_SHORT, SITE_URL } from "@/lib/site";

/**
 * Default social share card (1200×630) for every route that does not supply its
 * own image. Generated at build time — no binary asset to keep in the repo, and
 * it can never drift out of sync with the brand colours.
 */
export const alt = `${SITE_SHORT} — connecting buyers with services and service providers`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0b1e33 0%, #10243e 55%, #163a5f 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "#10243e",
              border: "4px solid rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 58,
              fontWeight: 900,
              color: "#7ac142",
            }}
          >
            D
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* satori requires an explicit display on any element with >1 child */}
            <div style={{ display: "flex", fontSize: 58, fontWeight: 900, letterSpacing: -1 }}>
              {SITE_SHORT}
            </div>
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.65)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 4 }}>
              CONNECTING BUYERS WITH SERVICES
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
            Connecting buyers with services
          </div>
          <div style={{ fontSize: 34, color: "rgba(255,255,255,0.82)", maxWidth: 940, lineHeight: 1.35 }}>
            Discover service providers and connect with the right services.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 99, background: "#7ac142" }} />
            <div style={{ fontSize: 26, fontWeight: 800, color: "#7ac142" }}>{SITE_SHORT}</div>
          </div>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>·</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#ffc72c" }}>Discover · Connect</div>
          <div style={{ marginLeft: "auto", fontSize: 26, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
            {SITE_URL.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
