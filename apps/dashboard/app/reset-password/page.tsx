import { redirect } from "next/navigation";

export default function DeprecatedMerchantResetPasswordPage() {
  redirect("/apply?source=merchant_auth_removed");
}
