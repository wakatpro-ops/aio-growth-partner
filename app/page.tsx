import { permanentRedirect } from "next/navigation";

const MARKETING_SITE_URL = "https://aioboost.jp/";

export default function HomePage() {
  permanentRedirect(MARKETING_SITE_URL);
}
