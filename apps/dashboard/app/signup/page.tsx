import { redirect } from "next/navigation";

export default function DeprecatedMerchantSignupPage() {
  redirect("/apply?source=merchant_signup_removed");
}
