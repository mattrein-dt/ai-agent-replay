import { PageLayout } from "@dynatrace/strato-components/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Workspace } from "./pages/Workspace";
import { Replay } from "./pages/Replay";

export const App = () => {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Header />
      </PageLayout.Header>
      <PageLayout.Content>
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/sessions" element={<Workspace />} />
          <Route path="/replay/:traceId" element={<Replay />} />
        </Routes>
      </PageLayout.Content>
    </PageLayout>
  );
};
