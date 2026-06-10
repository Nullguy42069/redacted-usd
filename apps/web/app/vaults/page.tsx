"use client";
import { VaultsListPage } from "@/components/VaultsListPage";

// Standalone Vaults page — always accessible from the sidebar so users can
// add, remove, sync, or switch between vaults regardless of whether a vault
// is currently loaded. (The same component is also rendered inline on the
// Overview page when no vault is loaded.)
export default function VaultsPage() {
  return <VaultsListPage />;
}
