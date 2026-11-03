// Per-format client setup guide: configure / use / CI snippets. Pure module, safe on server and client.
// Tokens are always placeholders — never inject a real credential into a snippet.

import { getRegistrySetupSnippets, projectRegistryUrl, type InstallContext, type Snippet } from "@/lib/gitlab/install-commands";
import type { FormatKey } from "@/lib/gitlab/formats";

export const SETUP_FORMATS = [
  { key: "npm", short: "npm" },
  { key: "maven", short: "mvn" },
  { key: "pypi", short: "pip" },
  { key: "nuget", short: "nupkg" },
  { key: "golang", short: "go" },
  { key: "composer", short: "php" },
  { key: "conan", short: "conan" },
  { key: "helm", short: "helm" },
  { key: "generic", short: "bin" },
  { key: "container", short: "oci" },
] as const satisfies readonly { key: FormatKey; short: string }[];

export type SetupFormat = (typeof SETUP_FORMATS)[number]["key"];

export function parseSetupFormat(value: string | undefined): SetupFormat {
  const v = value === "go" ? "golang" : value === "docker" ? "container" : value;
  return SETUP_FORMATS.find((f) => f.key === v)?.key ?? "npm";
}

export interface SetupContext extends InstallContext {
  /** `container_registry_image_prefix` of the project, e.g. registry.example.com/group/project */
  imagePrefix?: string | null;
}

export interface SetupGuide {
  /** Short file/location hint shown next to the "Configure" heading. */
  configureHint: string;
  configure: Snippet[];
  usage: Snippet[];
  ci: Snippet[];
  notes: string[];
}

const TOKEN = "<your_token>";
const API = "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages";

function host(url: string) {
  return url.replace(/^https?:\/\//, "");
}

function yaml(label: string, code: string): Snippet {
  return { label, language: "text", code };
}

export function getSetupGuide(format: SetupFormat, ctx: SetupContext): SetupGuide {
  const url = projectRegistryUrl(ctx, format);
  const gitlabHost = host(ctx.gitlabUrl);
  const shared = () => getRegistrySetupSnippets(format, ctx);

  switch (format) {
    case "npm":
      return {
        configureHint: ".npmrc",
        configure: shared(),
        usage: [
          { label: "Install", language: "bash", code: `export GITLAB_TOKEN=${TOKEN}\nnpm install @<your-scope>/<package>` },
          {
            label: "Publish",
            language: "bash",
            code: `# package.json "name" must use the scope, e.g. "@<your-scope>/<package>"\nexport GITLAB_TOKEN=${TOKEN}\nnpm publish --registry ${url}/`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `publish-npm:
  image: node:22
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - echo "@<your-scope>:registry=${API}/npm/" > .npmrc
    - echo "\${CI_API_V4_URL#http*:}/projects/\${CI_PROJECT_ID}/packages/npm/:_authToken=\${CI_JOB_TOKEN}" >> .npmrc
    - npm publish`,
          ),
        ],
        notes: ["The npm scope can be anything for project-level endpoints; it must match the scope in package.json."],
      };

    case "maven":
      return {
        configureHint: "pom.xml · ~/.m2/settings.xml",
        configure: shared(),
        usage: [
          {
            label: "Install",
            language: "xml",
            code: `<!-- pom.xml: add the dependency, then run "mvn install" -->\n<dependency>\n  <groupId>com.example</groupId>\n  <artifactId><artifact-id></artifactId>\n  <version><version></version>\n</dependency>`,
          },
          {
            label: "Publish",
            language: "xml",
            code: `<!-- pom.xml: then run "mvn deploy" -->\n<distributionManagement>\n  <repository>\n    <id>gitlab-maven</id>\n    <url>${url}</url>\n  </repository>\n  <snapshotRepository>\n    <id>gitlab-maven</id>\n    <url>${url}</url>\n  </snapshotRepository>\n</distributionManagement>`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `deploy-maven:
  image: maven:3-eclipse-temurin-21
  stage: deploy
  script:
    - mvn deploy -s ci_settings.xml`,
          ),
          {
            label: "ci_settings.xml",
            language: "xml",
            code: `<!-- commit this file to the repository -->
<settings>
  <servers>
    <server>
      <id>gitlab-maven</id>
      <configuration>
        <httpHeaders>
          <property>
            <name>Job-Token</name>
            <value>\${env.CI_JOB_TOKEN}</value>
          </property>
        </httpHeaders>
      </configuration>
    </server>
  </servers>
</settings>`,
          },
        ],
        notes: ["The <id> in settings.xml must match the repository <id> in pom.xml."],
      };

    case "pypi":
      return {
        configureHint: "pip.conf · twine",
        configure: shared(),
        usage: [
          {
            label: "Install",
            language: "bash",
            code: `pip install <package-name> \\\n  --index-url https://__token__:${TOKEN}@${host(url)}/simple`,
          },
          {
            label: "Publish",
            language: "bash",
            code: `python -m pip install build twine\npython -m build\nTWINE_USERNAME=__token__ TWINE_PASSWORD=${TOKEN} \\\n  python -m twine upload --repository-url ${url} dist/*`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `publish-pypi:
  image: python:3.12
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - pip install build twine
    - python -m build
    - TWINE_USERNAME=gitlab-ci-token TWINE_PASSWORD=\${CI_JOB_TOKEN} python -m twine upload --repository-url ${API}/pypi dist/*`,
          ),
        ],
        notes: [],
      };

    case "nuget":
      return {
        configureHint: "NuGet source",
        configure: shared(),
        usage: [
          { label: "Install", language: "bash", code: `dotnet add package <PackageId>` },
          {
            label: "Publish",
            language: "bash",
            code: `dotnet pack -c Release\ndotnet nuget push "bin/Release/*.nupkg" --source gitlab`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `deploy-nuget:
  image: mcr.microsoft.com/dotnet/sdk:8.0
  stage: deploy
  script:
    - dotnet pack -c Release
    - dotnet nuget add source "${API}/nuget/index.json" --name gitlab --username gitlab-ci-token --password $CI_JOB_TOKEN --store-password-in-clear-text
    - dotnet nuget push "bin/Release/*.nupkg" --source gitlab`,
          ),
        ],
        notes: [],
      };

    case "golang": {
      const modulePath = `${gitlabHost}/${ctx.projectPath ?? "<namespace>/<project>"}`;
      return {
        configureHint: "env · ~/.netrc",
        configure: shared(),
        usage: [
          { label: "Install", language: "bash", code: `go get ${modulePath}@v1.2.3` },
          {
            label: "Publish",
            language: "bash",
            code: `# Go modules are published by pushing a semver tag\ngit tag v1.2.3\ngit push origin v1.2.3`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `build:
  image: golang:1.23
  variables:
    GOPRIVATE: ${gitlabHost}
  before_script:
    - echo "machine \${CI_SERVER_HOST} login gitlab-ci-token password \${CI_JOB_TOKEN}" > ~/.netrc
  script:
    - go build ./...`,
          ),
        ],
        notes: [
          "GitLab's Go proxy is behind the go_proxy feature flag (off by default on self-managed). Without it, set GOPRIVATE and let Go fetch modules over Git with the ~/.netrc credentials.",
          "Fetching another project's module with CI_JOB_TOKEN requires this project to be in that project's job token allowlist.",
        ],
      };
    }

    case "composer":
      return {
        configureHint: "composer.json · auth",
        configure: [
          ...shared(),
          {
            label: "Authenticate",
            language: "bash",
            code: `composer config gitlab-domains ${gitlabHost}\ncomposer config gitlab-token.${gitlabHost} ${TOKEN}`,
          },
        ],
        usage: [
          { label: "Install", language: "bash", code: `composer require <vendor>/<package>:<version>` },
          {
            label: "Publish",
            language: "bash",
            code: `# publishes the given Git tag (or use branch=<name>)\ncurl --fail-with-body --header "PRIVATE-TOKEN: ${TOKEN}" \\\n  --data tag=v1.2.3 \\\n  "${url}"`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `publish-composer:
  image: curlimages/curl:latest
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - 'curl --fail-with-body --header "Job-Token: $CI_JOB_TOKEN" --data tag=$CI_COMMIT_TAG "${API}/composer"'`,
          ),
        ],
        notes: [
          ctx.groupId
            ? "Composer installs packages through the group endpoint, so the repository URL points at this project's group."
            : "Composer installs packages through a group endpoint only; projects in a personal namespace can publish but not be installed from directly.",
        ],
      };

    case "conan":
      return {
        configureHint: "conan remote (Conan 2)",
        configure: shared(),
        usage: [
          { label: "Install", language: "bash", code: `conan install --requires=<name>/<version> -r gitlab` },
          { label: "Publish", language: "bash", code: `conan create .\nconan upload "<name>/<version>" -r gitlab -c` },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `publish-conan:
  image: python:3.12
  stage: deploy
  script:
    - pip install conan
    - conan profile detect
    - conan remote add gitlab ${API}/conan
    - conan remote login gitlab ci_user -p $CI_JOB_TOKEN
    - conan create .
    - conan upload "<name>/<version>" -r gitlab -c`,
          ),
        ],
        notes: [],
      };

    case "helm":
      return {
        configureHint: "helm repo add",
        configure: shared(),
        usage: [
          { label: "Install", language: "bash", code: `helm install <release> gitlab/<chart> --version <version>` },
          {
            label: "Publish",
            language: "bash",
            code: `helm package ./<chart>\ncurl --fail-with-body --request POST \\\n  --user <username>:${TOKEN} \\\n  --form "chart=@<chart>-<version>.tgz" \\\n  "${url}/api/stable/charts"`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `publish-helm:
  image: alpine/helm:latest
  stage: deploy
  script:
    - apk add --no-cache curl
    - helm package ./<chart> --destination dist
    - |
      for chart in dist/*.tgz; do
        curl --fail-with-body --request POST --user gitlab-ci-token:$CI_JOB_TOKEN \\
          --form "chart=@\${chart}" "${API}/helm/api/stable/charts"
      done`,
          ),
        ],
        notes: ['"stable" is the Helm channel; use any channel name and add the matching repo URL.'],
      };

    case "generic": {
      const generic = `${ctx.gitlabUrl}/api/v4/projects/${ctx.projectId}/packages/generic`;
      return {
        configureHint: "no client config",
        configure: [
          {
            label: "Token",
            language: "bash",
            code: `# Generic packages need no client setup; send the token as a header.\nexport GITLAB_TOKEN=${TOKEN}`,
          },
        ],
        usage: [
          {
            label: "Upload",
            language: "bash",
            code: `curl --fail-with-body --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \\\n  --upload-file ./app.tar.gz \\\n  "${generic}/<name>/<version>/app.tar.gz"`,
          },
          {
            label: "Download",
            language: "bash",
            code: `curl --fail-with-body --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \\\n  -o app.tar.gz \\\n  "${generic}/<name>/<version>/app.tar.gz"`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `upload-generic:
  image: curlimages/curl:latest
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - 'curl --fail-with-body --header "JOB-TOKEN: $CI_JOB_TOKEN" --upload-file ./app.tar.gz "${API}/generic/<name>/\${CI_COMMIT_TAG}/app.tar.gz"'`,
          ),
        ],
        notes: ["Versions must look like 1.2.3 or 1.2.3-rc1; package names allow letters, digits, dots, dashes and underscores."],
      };
    }

    case "container": {
      const image = ctx.imagePrefix || "<registry>/<namespace>/<project>";
      const registry = ctx.imagePrefix ? ctx.imagePrefix.split("/")[0] : "<registry>";
      return {
        configureHint: "docker login",
        configure: [
          {
            label: "docker login",
            language: "bash",
            code: `echo "${TOKEN}" | docker login ${registry} -u <username> --password-stdin`,
          },
        ],
        usage: [
          { label: "Pull", language: "bash", code: `docker pull ${image}:<tag>` },
          {
            label: "Push",
            language: "bash",
            code: `docker build -t ${image}:<tag> .\ndocker push ${image}:<tag>\n\n# or a named image inside the project\ndocker push ${image}/<image-name>:<tag>`,
          },
        ],
        ci: [
          yaml(
            ".gitlab-ci.yml",
            `build-image:
  image: docker:27
  services:
    - docker:27-dind
  stage: build
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login $CI_REGISTRY -u $CI_REGISTRY_USER --password-stdin
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA`,
          ),
        ],
        notes: ["In CI, CI_REGISTRY_PASSWORD is the job's CI_JOB_TOKEN and CI_REGISTRY_IMAGE equals this project's image prefix."],
      };
    }
  }
}
