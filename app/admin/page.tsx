import type { Metadata } from "next";
import AdminConsole from "./AdminConsole";
export const metadata: Metadata = {
  title: "Quản trị · Dòng Chảy Thời Gian",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return <AdminConsole />;
}
