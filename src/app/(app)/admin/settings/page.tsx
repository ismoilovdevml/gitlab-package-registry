"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertCircle, Server } from "lucide-react";

export default function AdminSettingsPage() {
  const [gitlabUrl, setGitlabUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.gitlabUrl) setGitlabUrl(data.gitlabUrl);
        if (data.clientId) setClientId(data.clientId);
      })
      .catch(() => {});
  }, []);

  async function handleTestConnection() {
    setTesting(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", gitlabUrl }),
      });
      const data = await res.json();
      setTestResult(data);
      if (!data.ok) setError(data.error || "Ulanib bo'lmadi");
    } catch {
      setError("Tarmoq xatosi");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitlabUrl, clientId, clientSecret }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess("Sozlamalar saqlandi");
        setClientSecret("");
      } else {
        setError(data.error || "Xatolik yuz berdi");
      }
    } catch {
      setError("Tarmoq xatosi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sozlamalar</h1>
        <p className="text-muted-foreground">
          GitLab ulanish sozlamalari
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            GitLab Connection
          </CardTitle>
          <CardDescription>
            GitLab instansiyasi va OAuth sozlamalari
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {success}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="gitlabUrl">GitLab URL</Label>
            <div className="flex gap-2">
              <Input
                id="gitlabUrl"
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
              />
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            {testResult?.ok && (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-green-600 border-green-600">
                  v{testResult.version}
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientId">OAuth Client ID</Label>
            <Input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">
              OAuth Client Secret
              <span className="text-xs text-muted-foreground ml-2">
                (bo&apos;sh qoldiring agar o&apos;zgartirmoqchi bo&apos;lmasangiz)
              </span>
            </Label>
            <Input
              id="clientSecret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
