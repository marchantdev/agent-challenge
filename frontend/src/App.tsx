import { useState } from "react";
import type { View } from "./lib/types";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Chat from "./components/Chat";
import Scanner from "./components/Scanner";
import Protocols from "./components/Protocols";
import NosanaStatus from "./components/NosanaStatus";

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <Dashboard onNavigate={setView} />;
      case "chat":
        return <Chat />;
      case "scanner":
        return <Scanner />;
      case "protocols":
        return <Protocols />;
      case "nosana":
        return <NosanaStatus />;
    }
  };

  return (
    <Layout currentView={view} onNavigate={setView}>
      {renderView()}
    </Layout>
  );
}
