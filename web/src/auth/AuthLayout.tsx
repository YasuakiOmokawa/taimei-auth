import { Outlet } from "react-router-dom";
import { PhishingBanner } from "./PhishingBanner";

export const AuthLayout = () => {
  return (
    <>
      {import.meta.env.MODE === "production" && <PhishingBanner />}
      <Outlet />
    </>
  );
};
