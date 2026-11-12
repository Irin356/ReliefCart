import type { Metadata } from "next";
import ReliefCartApp from "@/components/ReliefCartApp";

export const metadata: Metadata = {
  title: "ReliefCart AI",
  description: "AI-assisted relief procurement with transparent PayPal Sandbox contributions.",
};

export default function HomePage() {
  return <ReliefCartApp />;
}
