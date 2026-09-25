// frontend/src/pages/Login.jsx
// „/“ — английският лендинг (x-default). От редизайна (25.09.2026) съдържанието
// е в i18n/landingEn.js, а оформлението — в site/Landing.jsx, общо за всичките
// 8 езика. Тук остават само SEO главата и пренасочването на влезлия потребител.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Seo from "../components/Seo";
import Landing from "../site/Landing";
import { LANDING_EN } from "../i18n/landingEn";
import { SITE_STRINGS } from "../i18n/siteStrings";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const error = new URLSearchParams(window.location.search).get("error");

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading]);

  return (
    <>
      <Seo title={LANDING_EN.title} description={LANDING_EN.description} path="/" lang="en" hreflang />
      <Landing t={LANDING_EN} s={SITE_STRINGS.en} locale="en" home="/" authError={error} />
    </>
  );
}
