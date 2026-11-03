// Install / registry-setup snippets per package format. Safe for client and server components.
// Tokens are always placeholders — never inject a real credential into a snippet.

export interface InstallContext {
  gitlabUrl: string;
  projectId: number;
  projectPath?: string;
  groupId?: number;
}

export interface Snippet {
  label: string;
  language: "bash" | "xml" | "ini" | "json" | "text";
  code: string;
}

const TOKEN = "<your_token>";

export function projectRegistryUrl(ctx: InstallContext, format: string): string {
  return `${ctx.gitlabUrl}/api/v4/projects/${ctx.projectId}/packages/${format}`;
}

function host(gitlabUrl: string) {
  return gitlabUrl.replace(/^https?:\/\//, "");
}

function mavenCoordinates(name: string) {
  // GitLab stores Maven packages as "com/acme/app" or "com.acme/app"
  const parts = name.split("/");
  const artifactId = parts.pop() || name;
  const groupId = parts.join(".") || artifactId;
  return { groupId, artifactId };
}

/** Snippets to configure a client for this project's registry (no specific package). */
export function getRegistrySetupSnippets(format: string, ctx: InstallContext): Snippet[] {
  const url = projectRegistryUrl(ctx, format);
  switch (format) {
    case "npm":
      return [
        {
          label: ".npmrc",
          language: "ini",
          code: `@<your-scope>:registry=${url}/\n//${host(url)}/:_authToken=\${GITLAB_TOKEN}`,
        },
      ];
    case "maven":
      return [
        {
          label: "pom.xml",
          language: "xml",
          code: `<repositories>\n  <repository>\n    <id>gitlab-maven</id>\n    <url>${url}</url>\n  </repository>\n</repositories>`,
        },
        {
          label: "~/.m2/settings.xml",
          language: "xml",
          code: `<servers>\n  <server>\n    <id>gitlab-maven</id>\n    <configuration>\n      <httpHeaders>\n        <property>\n          <name>Private-Token</name>\n          <value>${TOKEN}</value>\n        </property>\n      </httpHeaders>\n    </configuration>\n  </server>\n</servers>`,
        },
      ];
    case "pypi":
      return [
        {
          label: "pip.conf",
          language: "ini",
          code: `[global]\nindex-url = https://__token__:${TOKEN}@${host(url)}/simple`,
        },
        {
          label: "Upload with twine",
          language: "bash",
          code: `TWINE_USERNAME=__token__ TWINE_PASSWORD=${TOKEN} \\\n  python -m twine upload --repository-url ${url} dist/*`,
        },
      ];
    case "nuget":
      return [
        {
          label: "Add source",
          language: "bash",
          code: `dotnet nuget add source "${url}/index.json" \\\n  --name gitlab --username <username> --password ${TOKEN} --store-password-in-clear-text`,
        },
      ];
    case "golang":
      return [
        {
          label: "Environment",
          language: "bash",
          code: `export GOPROXY=${url},https://proxy.golang.org,direct\nexport GONOSUMDB=${host(ctx.gitlabUrl)}\n# ~/.netrc\nmachine ${host(ctx.gitlabUrl)} login <username> password ${TOKEN}`,
        },
      ];
    case "composer":
      return [
        {
          label: "composer.json",
          language: "json",
          code: `{\n  "repositories": [\n    { "type": "composer", "url": "${ctx.gitlabUrl}/api/v4/group/${ctx.groupId ?? "<group_id>"}/-/packages/composer/packages.json" }\n  ]\n}`,
        },
      ];
    case "conan":
      return [
        {
          label: "Add remote",
          language: "bash",
          code: `conan remote add gitlab ${url}\nconan remote login gitlab <username> -p ${TOKEN}`,
        },
      ];
    case "helm":
      return [
        {
          label: "Add repo",
          language: "bash",
          code: `helm repo add --username <username> --password ${TOKEN} gitlab ${url}/stable\nhelm repo update`,
        },
      ];
    case "rubygems":
      return [
        { label: "~/.gem/credentials", language: "text", code: `---\n${url}: '${TOKEN}'` },
      ];
    case "debian":
      return [
        {
          label: "sources.list",
          language: "text",
          code: `deb [ trusted=yes ] ${url}/debian <distribution> main`,
        },
      ];
    case "terraform_module":
      return [
        {
          label: "~/.terraformrc",
          language: "text",
          code: `credentials "${host(ctx.gitlabUrl)}" {\n  token = "${TOKEN}"\n}`,
        },
      ];
    case "container":
      return [
        {
          label: "Login",
          language: "bash",
          code: `docker login <registry-host> -u <username> -p ${TOKEN}`,
        },
      ];
    default:
      return [
        {
          label: "Upload",
          language: "bash",
          code: `curl --fail-with-body --header "PRIVATE-TOKEN: ${TOKEN}" \\\n  --upload-file ./file.tar.gz \\\n  "${url}/generic/<name>/<version>/file.tar.gz"`,
        },
      ];
  }
}

/** Snippets to install a specific package version. */
export function getInstallSnippets(
  pkg: { packageType: string; name: string; version: string; fileName?: string },
  ctx: InstallContext,
): Snippet[] {
  const { packageType, name, version } = pkg;
  const url = projectRegistryUrl(ctx, packageType);
  switch (packageType) {
    case "npm":
      return [
        { label: "npm", language: "bash", code: `npm install ${name}@${version}` },
        { label: "pnpm", language: "bash", code: `pnpm add ${name}@${version}` },
        { label: "yarn", language: "bash", code: `yarn add ${name}@${version}` },
      ];
    case "maven": {
      const { groupId, artifactId } = mavenCoordinates(name);
      return [
        {
          label: "Maven",
          language: "xml",
          code: `<dependency>\n  <groupId>${groupId}</groupId>\n  <artifactId>${artifactId}</artifactId>\n  <version>${version}</version>\n</dependency>`,
        },
        { label: "Gradle", language: "text", code: `implementation '${groupId}:${artifactId}:${version}'` },
      ];
    }
    case "pypi":
      return [
        {
          label: "pip",
          language: "bash",
          code: `pip install ${name}==${version} \\\n  --index-url https://__token__:${TOKEN}@${host(url)}/simple`,
        },
      ];
    case "nuget":
      return [{ label: "dotnet", language: "bash", code: `dotnet add package ${name} --version ${version}` }];
    case "golang":
      return [{ label: "go", language: "bash", code: `GOPROXY=${url} go get ${name}@${version}` }];
    case "composer":
      return [{ label: "composer", language: "bash", code: `composer require ${name}:${version}` }];
    case "conan":
      return [{ label: "conan", language: "bash", code: `conan install --requires=${name}/${version} -r gitlab` }];
    case "helm":
      return [
        {
          label: "helm",
          language: "bash",
          code: `helm repo add --username <username> --password ${TOKEN} gitlab ${url}/stable\nhelm install ${name} gitlab/${name} --version ${version}`,
        },
      ];
    case "rubygems":
      return [{ label: "gem", language: "bash", code: `gem install ${name} -v ${version} --source "${url}"` }];
    case "terraform_module":
      return [
        {
          label: "Terraform",
          language: "text",
          code: `module "${name.split("/")[0]}" {\n  source  = "${host(ctx.gitlabUrl)}/${ctx.projectPath ?? "<namespace>"}/${name}"\n  version = "${version}"\n}`,
        },
      ];
    case "container":
      return [{ label: "docker", language: "bash", code: `docker pull ${name}:${version}` }];
    default:
      return [
        {
          label: "curl",
          language: "bash",
          code: `curl --fail-with-body --header "PRIVATE-TOKEN: ${TOKEN}" \\\n  -o "${pkg.fileName ?? "<file_name>"}" \\\n  "${url}/generic/${encodeURIComponent(name)}/${encodeURIComponent(version)}/${pkg.fileName ?? "<file_name>"}"`,
        },
      ];
  }
}
