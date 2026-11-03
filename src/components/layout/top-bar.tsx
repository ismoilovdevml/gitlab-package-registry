"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Menu, Moon, Search, Sun, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SidebarNav, type ShellUser } from "./sidebar";

function GlobalSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="flex h-10 min-w-0 max-w-[560px] flex-1 items-center gap-2 rounded-[9px] border bg-background px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(routes.search(q.trim()));
      }}
    >
      <Search className="size-4 shrink-0" />
      <input
        ref={inputRef}
        type="search"
        aria-label="Search packages"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search packages, versions, sha256…"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <kbd className="hidden rounded-[5px] border bg-card px-1.5 py-0.5 font-mono text-[11px] sm:inline">⌘K</kbd>
    </form>
  );
}

export function TopBar({ user, gitlabHost }: { user: ShellUser; gitlabHost: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const initials = (user.name || user.username).slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-backdrop-filter:bg-card/75">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger render={<Button variant="outline" size="icon-lg" className="lg:hidden" aria-label="Open navigation" />}>
            <Menu />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-0 p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav user={user} gitlabHost={gitlabHost} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        <GlobalSearch />

        <div className="ml-auto flex items-center gap-2">
          <Link href={routes.clientSetup} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "hidden h-10 px-3.5 md:inline-flex")}>
            Set up client
          </Link>
          <Link href={routes.publish} className={cn(buttonVariants({ size: "lg" }), "h-10 px-3.5")}>
            <Upload />
            <span className="hidden sm:inline">Publish</span>
          </Link>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-10"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-lg" className="size-10 rounded-full" aria-label="Account menu">
                  <Avatar className="size-8">
                    <AvatarImage src={user.avatarUrl || undefined} alt="" />
                    <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-52">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name || user.username}</p>
                <p className="text-xs text-muted-foreground">@{user.username}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => formRef.current?.requestSubmit()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <form ref={formRef} action="/api/auth/logout" method="post" className="hidden" />
        </div>
      </div>
    </header>
  );
}
