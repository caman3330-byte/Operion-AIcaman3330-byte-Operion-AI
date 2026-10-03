import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Operion Capital",
    short_name: "Operion",
    description: "Private capital access, business funding preparation, and lender matching for growth-focused businesses.",
    start_url: "/",
    display: "browser",
    background_color: "#f8fbff",
    theme_color: "#0b5cab",
    icons: [{ src: "/icon.svg", sizes: "64x64", type: "image/svg+xml", purpose: "any" }]
  };
}
