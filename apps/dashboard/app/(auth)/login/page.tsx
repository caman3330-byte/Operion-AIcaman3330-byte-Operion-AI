import { redirect } from "next/navigation";

export default function DeprecatedMerchantLoginPage() {
  redirect("/apply?source=merchant_login_removed");
}
