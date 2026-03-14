import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #C9956B 0%, #B8845A 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: "white",
            fontSize: 96,
            fontWeight: 700,
            fontFamily: "sans-serif",
          }}
        >
          A
        </div>
      </div>
    ),
    { ...size }
  );
}
