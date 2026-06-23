import { ImageResponse } from "next/og";

import { getBrandMarkDataUrl } from "@/lib/brand/asset";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={getBrandMarkDataUrl()} width={180} height={180} alt="" />
      </div>
    ),
    { ...size },
  );
}
