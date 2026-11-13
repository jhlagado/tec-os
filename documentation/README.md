# tec-os documentation publishing

The website is a separate VitePress package in this directory. Its output is
`.vitepress/dist`. The operating system package and its build commands are
unchanged.

## Local use

Requires Node.js 22 or later.

The package keeps VitePress 1.6.4 from the reference template and pins its Vite
dependency to 6.4.6 for the published development-server security fixes.

```sh
cd documentation
npm ci
npm run check
npm test
npm run build
npm run preview
```

`npm run dev` serves the editable site. `npm run build` renders it and checks
internal pages, assets and fragment links. It also checks the canonical domain,
search index and publication boundary. `npm run check:import` separately checks
the original forty imported manuscript files against their recorded hashes.

## Books and navigation

`content/tec-os/` contains the existing TEC-OS book. Its introduction,
29 chapters and ten appendices were imported without wording changes.
`provenance.json` records the source revision and hashes. The theme was adapted
from the same publishing system as debug80.com. The reference repository is
not needed to install or build this site.

`books.json` is the book catalogue. Each entry names a directory under
`content/`, its title, navigation label, description and front-matter parent.
Chapters use the reference convention:

```yaml
---
title: Chapter title
parent: Book title
nav_order: 1
nav_group: Using the machine
---
```

A new book needs an `index.md`, chapter files and a catalogue entry. Navigation
is generated during configuration, ordered by `nav_order` and grouped by
`nav_group`. It supplies a separate sidebar and previous/next sequence for
each book. No theme changes are required. The Thorium page links the actual
TAS, TED and TDB manuals until books on those subjects are available.

The original-import check is intentionally separate from the build. Later
authored revisions can change the book without falsifying the historical
import record. A new upstream import should update `provenance.json` with its
actual source revision and file hashes.

Only `content/` becomes documentation pages. Keep editorial records, build
scripts and private notes outside it. Public assets belong in `public/`.
The theme retains the reference's numbered figures and image previews.

## GitHub Pages

`.github/workflows/documentation.yml` installs from this package's lockfile,
checks the source, runs the publishing controls and builds the site. It uploads
**only `documentation/.vitepress/dist`**. Pull requests validate without
deploying. Changes to documentation on `main`, or a manual dispatch on `main`,
publish through the `github-pages` environment after Pages is enabled.

In the repository's **Settings → Pages**, select **GitHub Actions** as the
source. Set the custom domain to **tec-os.org**. The configuration uses the
domain root, not a `/tec-os/` prefix. The generated `CNAME` contains the domain
for portable static hosting, but that file does not configure an Actions-based
Pages site's custom domain: the repository setting must also be applied.

The repository can remain private with a GitHub plan that includes private
repository Pages. The generated website is public.

## Cloudflare DNS

Bind `tec-os.org` in GitHub Pages before directing DNS to GitHub. In the
Cloudflare zone, use these records with **DNS only**, not the orange proxy:

| Type | Name | Content |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `jhlagado.github.io` |

TTL can remain Auto. Preserve unrelated mail and verification records. Avoid
conflicting A, AAAA or CNAME records on these names. GitHub redirects `www` to
the configured apex domain once both names resolve correctly.

After DNS propagates, GitHub provisions the certificate. Enable **Enforce
HTTPS** when the option becomes available and check both the apex and `www`
addresses. Certificate provisioning can take time; a locally successful build
does not establish that DNS or HTTPS is active.

Official references:

- [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

## Hosting status

On 13 November 2026, GitHub Settings displayed: “Upgrade or make this
repository public to enable Pages.” The repository remains private. The site
configuration is prepared, but Pages, the custom-domain binding and DNS have
not been applied by this implementation. Publication requires a hosting
decision or a GitHub plan that includes private-repository Pages.
