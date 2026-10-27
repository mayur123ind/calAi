import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CalAi",
    short_name: "CalAi",
    description: "Snap your plate, see your calories.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3ec",
    theme_color: "#0b1a12",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
