"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, Menu, Package, LayoutDashboard, FolderGit2, Settings } from "lucide-react";
import Link from "next/link";

interface TopBarProps {
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export function TopBar({ username, name, avatarUrl }: TopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const initials = (name || username).slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="md:hidden" />}
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Package className="h-6 w-6 text-primary" />
                <span className="font-semibold text-lg">GLPR</span>
              </Link>
            </div>
            <nav className="p-3 space-y-1">
              <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link href="/packages" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm">
                <Package className="h-4 w-4" />
                Packages
              </Link>
              <Link href="/projects" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm">
                <FolderGit2 className="h-4 w-4" />
                Projects
              </Link>
              <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <div className="md:hidden" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={avatarUrl || undefined} alt={username} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm">{username}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{name || username}</p>
              <p className="text-xs text-muted-foreground">@{username}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Chiqish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
