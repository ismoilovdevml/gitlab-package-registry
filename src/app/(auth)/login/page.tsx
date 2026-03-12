"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, GitBranch, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gitlabUrl, setGitlabUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(decodeURIComponent(err));

    fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "info" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.gitlabUrl) setGitlabUrl(data.gitlabUrl);
      })
      .catch(() => {});
  }, []);

  function handleLogin() {
    setLoading(true);
    window.location.href = "/api/auth/callback?action=login";
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <GitBranch className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">GitLab Package Registry</CardTitle>
        <CardDescription>
          Paketlaringizni boshqarish uchun GitLab hisobingiz bilan kiring
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {gitlabUrl && (
          <p className="text-center text-sm text-muted-foreground">
            {gitlabUrl}
          </p>
        )}

        <Button className="w-full" size="lg" onClick={handleLogin} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GitBranch className="mr-2 h-4 w-4" />
          )}
          GitLab bilan kirish
        </Button>
      </CardContent>
    </Card>
  );
}
