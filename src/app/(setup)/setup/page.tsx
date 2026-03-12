"use client";

import { useState } from "react";
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
import { CheckCircle2, Loader2, AlertCircle, Server, KeyRound, Plug } from "lucide-react";

type Step = "gitlab_url" | "oauth_instructions" | "oauth_credentials" | "test";

export default function SetupPage() {
  const [step, setStep] = useState<Step>("gitlab_url");
  const [gitlabUrl, setGitlabUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string } | null>(null);

  async function handleTestConnection() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          gitlabUrl: gitlabUrl.replace(/\/$/, ""),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult(data);
        setStep("oauth_instructions");
      } else {
        setError(data.error || "GitLab serverga ulanib bo'lmadi");
      }
    } catch {
      setError("Tarmoq xatosi yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          gitlabUrl: gitlabUrl.replace(/\/$/, ""),
          clientId,
          clientSecret,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep("test");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else {
        setError(data.error || "Saqlashda xatolik yuz berdi");
      }
    } catch {
      setError("Tarmoq xatosi yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">GitLab Package Registry UI</CardTitle>
        <CardDescription>
          Boshlang&apos;ich sozlash — GitLab instansiyangizni ulang
        </CardDescription>
        <div className="flex justify-center gap-2 pt-2">
          {(["gitlab_url", "oauth_instructions", "oauth_credentials", "test"] as Step[]).map(
            (s, i) => (
              <Badge
                key={s}
                variant={step === s ? "default" : s < step ? "secondary" : "outline"}
              >
                {i + 1}
              </Badge>
            ),
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "gitlab_url" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
              <Server className="h-5 w-5" />
              <span className="text-sm font-medium">1-qadam: GitLab URL</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gitlabUrl">GitLab instance URL</Label>
              <Input
                id="gitlabUrl"
                placeholder="https://gitlab.example.com"
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Self-hosted GitLab instansiyangiz manzilini kiriting
              </p>
            </div>
          </div>
        )}

        {step === "oauth_instructions" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
              <KeyRound className="h-5 w-5" />
              <span className="text-sm font-medium">2-qadam: OAuth Application yaratish</span>
            </div>
            <div className="text-sm space-y-3">
              <p>GitLab da OAuth application yarating:</p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>
                  <a
                    href={`${gitlabUrl}/admin/applications/new`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {gitlabUrl}/admin/applications/new
                  </a>{" "}
                  sahifasiga o&apos;ting
                </li>
                <li>Name: <code className="bg-muted px-1 rounded">GLPR UI</code></li>
                <li>
                  Redirect URI:{" "}
                  <code className="bg-muted px-1 rounded">
                    {typeof window !== "undefined" ? window.location.origin : ""}/api/auth/callback
                  </code>
                </li>
                <li>
                  Scopes: <code className="bg-muted px-1 rounded">read_user</code> va{" "}
                  <code className="bg-muted px-1 rounded">api</code>
                </li>
                <li>Confidential: <code className="bg-muted px-1 rounded">Yes</code></li>
                <li>Save bosing va Client ID / Secret ni nusxalang</li>
              </ol>
              {testResult && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  GitLab v{testResult.version} — ulanish muvaffaqiyatli
                </div>
              )}
            </div>
          </div>
        )}

        {step === "oauth_credentials" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
              <Plug className="h-5 w-5" />
              <span className="text-sm font-medium">3-qadam: OAuth ma&apos;lumotlari</span>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="clientId">Application ID (Client ID)</Label>
                <Input
                  id="clientId"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === "test" && (
          <div className="text-center space-y-4 py-6">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto" />
            <div>
              <p className="font-medium text-lg">Sozlash tugallandi!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Login sahifasiga yo&apos;naltirilmoqda...
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        {step !== "gitlab_url" && step !== "test" && (
          <Button
            variant="outline"
            onClick={() => {
              if (step === "oauth_instructions") setStep("gitlab_url");
              if (step === "oauth_credentials") setStep("oauth_instructions");
            }}
          >
            Orqaga
          </Button>
        )}
        {step === "gitlab_url" && <div />}

        {step === "gitlab_url" && (
          <Button onClick={handleTestConnection} disabled={!gitlabUrl || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ulanishni tekshirish
          </Button>
        )}

        {step === "oauth_instructions" && (
          <Button onClick={() => setStep("oauth_credentials")}>Davom etish</Button>
        )}

        {step === "oauth_credentials" && (
          <Button
            onClick={handleSaveSettings}
            disabled={!clientId || !clientSecret || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
