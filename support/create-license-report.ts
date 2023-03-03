// SPDX-FileCopyrightText: con terra GmbH and contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";

/**
 * Generates a license report from the dependencies of this repository.
 * Should be invoked via `pnpm build-license-report` (or manually from the project root).
 * 
 * Outputs an html file (TODO: Location).
 */

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_JSON_PATH = resolve(PACKAGE_DIR, "report.json");
const REPORT_HTML_PATH = resolve(PACKAGE_DIR, "report.html");
const PACKAGE_JSON_PATH = resolve(PACKAGE_DIR, "package.json");

function main() {
    const reportJson = readReportJson(REPORT_JSON_PATH);
    const projectName = getProjectName();

    // TODO: Handle multiple licenses
    const licenseItems = reportJson.dependencies.map((dependency, index) => {
        const name = dependency.name;
        const licenses = dependency.licenses?.join(", ");
        if (!licenses) {
            console.warn(`Failed to detect licenses of dependency '${name}'.`);
            // TODO throw or overwritten value from config
        }

        const licenseText = dependency?.texts;
        if (!licenseText) {
            console.warn(`Failed to detect license text of dependency '${name}'.`);
            // TODO throw or overwritten value from config
        }

        const item: LicenseItem = {
            id: `dep-${index}`,
            name: name,
            license: licenses,
            licenseText: licenseText,
            noticeText: dependency.notice
        };
        return item;
    });
    const reportHtml = generateReportHtml(projectName, licenseItems);
    writeFileSync(REPORT_HTML_PATH, reportHtml, "utf-8");
}

interface Report {
    dependencies: Dependency[];
}

interface Dependency {
    name: string;
    version: string;
    authors: string;
    licenses: string[];
    texts: string;
    notice: string;
}

function readReportJson(path: string): Report {
    const content = readFileSync(path, "utf-8");
    const json = JSON.parse(content);
    return json;
}

interface LicenseItem {
    /** Unique id */
    id: string;

    /** Project name */
    name: string;

    /** License name(s) */
    license: string;

    /** License text(s) */
    licenseText: string;

    /** Notice text(s) */
    noticeText: string;
}

function generateReportHtml(projectName: string, licenseItems: LicenseItem[]): string {
    return partials.index({
        projectName,
        licenseItems,
    }, {
        partials
    });
}

function getProjectName(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
        data = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
    } catch (e) {
        throw new Error(`Failed to read package.json: ${e}`);
    }
    const name = data?.name;
    if (typeof name === "string") {
        return name;
    }
    throw new Error(`Failed to retrieve 'name' from package.json: it must be a string.`);
}

const partials = {
    "index": Handlebars.compile(`
        <html>
        <head>
            <title>License report for {{projectName}}</title>
            <style>
                body {
                    max-width: 960px;
                    margin: auto;
                }

                .dependencies {
                    list-style: none;
                    margin: 0;
                    margin-top: 1em;
                    padding: 0;
                }
                
                .toggle {
                    color: blue;
                    text-decoration: underline;
                }

                .dependency .header h2 {
                    font-size: 1.25em;
                    margin-top: 0;
                    margin-bottom: 0.5em;
                    padding: 0;
                }

                .dependency .header .title {
                    display: inline-block;
                    cursor: pointer;
                }

                .dependency .content {
                    display: none;

                    margin-bottom: 2em;
                }

                .dependency .content h3 {
                    padding: 0;
                    margin: 0;
                    margin-bottom: 0.5em;
                }
                
                .dependency .content pre {
                    white-space: pre-line;
                    background-color: #eeeeee;
                    border-radius: 5px;
                    padding: 5px;
                }

                .dependency .content-visible {
                    display: block;
                }
            </style>
        </head>
        <body>
            <h1>License report for {{projectName}}</h1>

            <div>
                <a id="show-all" class="toggle" href="#">
                    Show all
                </a>
                | 
                <a id="hide-all" class="toggle" href="#">
                    Hide all
                </a>
            </div>

            <ul class="dependencies">
            {{#each licenseItems}}
                {{> license-item }}
            {{/each}}
            </ul>
            <script>
                const allTargets = [];

                function registerHandlers() {
                    const elements = document.body.querySelectorAll(".dependency .header .title");
                    for (const element of elements) {
                        const target = document.getElementById(element.dataset.target);
                        allTargets.push(target);

                        element.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleTarget(target);
                        });
                    }

                    document.getElementById("show-all").addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleAll(true);
                    });
                    document.getElementById("hide-all").addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleAll(false);
                    });
                }

                function toggleTarget(target, force) {
                    const className = "content-visible";
                    const classList = target.classList;
                    if (force != null) {
                        if (force) {
                            classList.add(className);
                        } else {
                            classList.remove(className);
                        }
                    } else {
                        classList.toggle(className);
                    }
                }

                function toggleAll(show) {
                    for (const target of allTargets) {
                        toggleTarget(target, show);
                    }
                }

                registerHandlers();
            </script>
        </body>
        </html>
    `),
    "license-item": Handlebars.compile(`
        <li class="dependency">
            <div class="header">
                <a class="toggle title" href="#" data-target="{{id}}-content">
                    <h2>{{ name }} (License: {{license}})</h2>
                </a>
            </div>
            <div id="{{id}}-content" class="content">
                <h3>License:</h3>
                <pre>{{licenseText}}</pre>
                {{#if noticeText}}
                    <h3>Notice</h3>
                    <pre>{{noticeText}}</pre>
                {{/if}}
            </div>
        </li>
    `)
};

main();