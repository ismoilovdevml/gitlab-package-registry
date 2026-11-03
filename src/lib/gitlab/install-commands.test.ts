import { describe, expect, it } from "vitest";
import { getInstallSnippets, getRegistrySetupSnippets, projectRegistryUrl, type InstallContext } from "./install-commands";
import { PACKAGE_TYPES } from "./formats";

const ctx: InstallContext = { gitlabUrl: "https://gitlab.example.com", projectId: 42, projectPath: "acme/app", groupId: 7 };
const httpCtx: InstallContext = { gitlabUrl: "http://gitlab.local:8080", projectId: 3 };
const API = "https://gitlab.example.com/api/v4/projects/42/packages";

const allCode = (snippets: { code: string }[]) => snippets.map((s) => s.code).join("\n");

describe("projectRegistryUrl", () => {
  it("uses the package type as the path segment by default", () => {
    expect(projectRegistryUrl(ctx, "npm")).toBe(`${API}/npm`);
    expect(projectRegistryUrl(ctx, "generic")).toBe(`${API}/generic`);
  });

  it("maps golang to /packages/go and terraform_module to /packages/terraform/modules", () => {
    expect(projectRegistryUrl(ctx, "golang")).toBe(`${API}/go`);
    expect(projectRegistryUrl(ctx, "terraform_module")).toBe(`${API}/terraform/modules`);
  });
});

describe("getRegistrySetupSnippets", () => {
  it("generic upload URL has a single /packages/generic/<name> segment", () => {
    const code = allCode(getRegistrySetupSnippets("generic", ctx));
    expect(code).toContain(`"${API}/generic/<name>/<version>/file.tar.gz"`);
    expect(code).not.toMatch(/generic\/generic/);
  });

  it("npm .npmrc scopes the auth token to the registry path without scheme", () => {
    const [npmrc] = getRegistrySetupSnippets("npm", ctx);
    expect(npmrc.code).toBe(
      `@<your-scope>:registry=${API}/npm/\n//gitlab.example.com/api/v4/projects/42/packages/npm/:_authToken=<your_token>`,
    );
  });

  it("pypi index-url keeps https and embeds the placeholder token", () => {
    const [pip] = getRegistrySetupSnippets("pypi", ctx);
    expect(pip.code).toContain("index-url = https://__token__:<your_token>@gitlab.example.com/api/v4/projects/42/packages/pypi/simple");
  });

  it("pypi index-url keeps the http scheme for a plain-http GitLab", () => {
    const [pip] = getRegistrySetupSnippets("pypi", httpCtx);
    expect(pip.code).toContain("index-url = http://__token__:<your_token>@gitlab.local:8080/api/v4/projects/3/packages/pypi/simple");
    expect(pip.code).not.toContain("https://");
  });

  it("golang GOPROXY points at /packages/go and GONOSUMDB at the bare host", () => {
    const code = allCode(getRegistrySetupSnippets("golang", ctx));
    expect(code).toContain(`export GOPROXY=${API}/go,https://proxy.golang.org,direct`);
    expect(code).toContain("export GONOSUMDB=gitlab.example.com\n");
    expect(code).toContain("machine gitlab.example.com login <username> password <your_token>");
  });

  it("composer uses the group endpoint, with a placeholder when the group is unknown", () => {
    expect(allCode(getRegistrySetupSnippets("composer", ctx))).toContain(
      "https://gitlab.example.com/api/v4/group/7/-/packages/composer/packages.json",
    );
    expect(allCode(getRegistrySetupSnippets("composer", httpCtx))).toContain("/api/v4/group/<group_id>/-/packages/composer/");
  });

  it("debian sources.list points at the project debian endpoint without a duplicated segment", () => {
    const [list] = getRegistrySetupSnippets("debian", ctx);
    expect(list.code).toBe(`deb [ trusted=yes ] ${API}/debian <distribution> main`);
  });

  it("helm repo uses the stable channel", () => {
    expect(allCode(getRegistrySetupSnippets("helm", ctx))).toContain(`gitlab ${API}/helm/stable`);
  });

  it("nuget source points at the v3 index.json", () => {
    expect(allCode(getRegistrySetupSnippets("nuget", ctx))).toContain(`"${API}/nuget/index.json"`);
  });

  it("terraform credentials are keyed by the bare GitLab host", () => {
    expect(allCode(getRegistrySetupSnippets("terraform_module", ctx))).toContain('credentials "gitlab.example.com" {');
  });

  it("maven repository url is the project maven endpoint", () => {
    const [pom, settings] = getRegistrySetupSnippets("maven", ctx);
    expect(pom.code).toContain(`<url>${API}/maven</url>`);
    expect(settings.code).toContain("<value><your_token></value>");
  });

  it.each([...PACKAGE_TYPES, "container", "ml_model"])("%s setup snippets only contain placeholder tokens", (format) => {
    const snippets = getRegistrySetupSnippets(format, ctx);
    expect(snippets.length).toBeGreaterThan(0);
    for (const s of snippets) {
      expect(s.label).not.toBe("");
      expect(s.code).not.toMatch(/glpat-|undefined|null/);
      if (/token|password|_authToken|Private-Token/i.test(s.code)) expect(s.code).toContain("<your_token>");
    }
  });
});

describe("getInstallSnippets", () => {
  const install = (packageType: string, name: string, version = "1.2.3", fileName?: string) =>
    getInstallSnippets({ packageType, name, version, fileName }, ctx);

  it("generic download URL is /packages/generic/<name>/<version>/<file> with encoded segments", () => {
    const [curl] = install("generic", "my tool", "1.0.0+build", "tool.tar.gz");
    expect(curl.code).toContain(`"${API}/generic/my%20tool/1.0.0%2Bbuild/tool.tar.gz"`);
    expect(curl.code).toContain('-o "tool.tar.gz"');
    expect(curl.code).not.toMatch(/generic\/generic/);
  });

  it("generic falls back to a file name placeholder", () => {
    const [curl] = install("generic", "tool");
    expect(curl.code).toContain(`"${API}/generic/tool/1.2.3/<file_name>"`);
  });

  it("npm offers npm, pnpm and yarn with name@version", () => {
    const snippets = install("npm", "@acme/ui");
    expect(snippets.map((s) => s.label)).toEqual(["npm", "pnpm", "yarn"]);
    expect(snippets[0].code).toBe("npm install @acme/ui@1.2.3");
  });

  it("pypi pip install keeps the GitLab scheme", () => {
    const [pip] = getInstallSnippets({ packageType: "pypi", name: "lib", version: "2.0" }, httpCtx);
    expect(pip.code).toContain("pip install lib==2.0");
    expect(pip.code).toContain("--index-url http://__token__:<your_token>@gitlab.local:8080/api/v4/projects/3/packages/pypi/simple");
  });

  it("golang uses the /packages/go proxy", () => {
    expect(install("golang", "gitlab.example.com/acme/mod")[0].code).toBe(
      `GOPROXY=${API}/go go get gitlab.example.com/acme/mod@1.2.3`,
    );
  });

  it("terraform module source uses host + project path + name", () => {
    const [tf] = install("terraform_module", "vpc/aws");
    expect(tf.code).toContain('module "vpc" {');
    expect(tf.code).toContain('source  = "gitlab.example.com/acme/app/vpc/aws"');
    expect(tf.code).toContain('version = "1.2.3"');
  });

  it("terraform module source uses a namespace placeholder without a project path", () => {
    const [tf] = getInstallSnippets({ packageType: "terraform_module", name: "vpc/aws", version: "1.0.0" }, httpCtx);
    expect(tf.code).toContain('source  = "gitlab.local:8080/<namespace>/vpc/aws"');
  });

  it("helm installs from the stable channel", () => {
    expect(install("helm", "chart")[0].code).toContain("helm install chart gitlab/chart --version 1.2.3");
  });

  describe("maven coordinates", () => {
    const coords = (name: string) => {
      const [maven, gradle] = install("maven", name, "1.0");
      return { maven: maven.code, gradle: gradle.code };
    };

    it("splits slash-separated paths into groupId (dotted) and artifactId", () => {
      const { maven, gradle } = coords("com/acme/app");
      expect(maven).toContain("<groupId>com.acme</groupId>");
      expect(maven).toContain("<artifactId>app</artifactId>");
      expect(gradle).toBe("implementation 'com.acme:app:1.0'");
    });

    it("keeps an already dotted groupId", () => {
      expect(coords("com.acme/app").gradle).toBe("implementation 'com.acme:app:1.0'");
    });

    it("uses the name as both ids when there is no group path", () => {
      expect(coords("app").gradle).toBe("implementation 'app:app:1.0'");
    });
  });

  it.each([...PACKAGE_TYPES, "container"])("%s install snippets never leak real-looking tokens", (format) => {
    for (const s of install(format, "pkg", "1.0.0", "pkg.bin")) {
      expect(s.code).not.toMatch(/glpat-|undefined|null/);
      if (/TOKEN|password/i.test(s.code)) expect(s.code).toContain("<your_token>");
    }
  });
});
