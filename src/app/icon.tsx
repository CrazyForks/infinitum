import { ImageResponse } from "next/og";

import { getBrandMarkDataUrl } from "@/lib/brand/asset";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
        <img src={getBrandMarkDataUrl()} width={32} height={32} alt="" />
      </div>
    ),
    { ...size },
  );
}
