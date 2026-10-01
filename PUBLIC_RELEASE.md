# Public Release Checklist

Use this checklist before publishing DryErase to a public code host.

1. Review tracked files for credentials, private hostnames, local network details, and personal operational material.
2. Confirm `.env.local`, runtime data, generated output, and other machine-specific files are ignored.
3. Run `npm run verify` and inspect `npm pack --dry-run` before distributing a source archive.
4. Review the complete Git history, not only the current tree. Removing private material in a new commit does not remove it from older commits.
5. If prior history contains private operational material, publish a new clean-root history or use a reviewed history-rewrite process before creating the public remote.
6. Confirm the public remote and CI configuration contain only public-safe repository information.

## Clean-Root Publication

For a first public publication, a clean-root branch avoids sending earlier private commits to the public remote. Run this only after reviewing the current tree and replacing the placeholder remote URL:

```bash
git checkout --orphan public-main
git add -A
git commit -m "Initial public release"
git remote add public https://github.com/ACCOUNT/REPOSITORY.git
git push -u public public-main:main
```

Do not push existing private branches or tags to that remote. Protect the public default branch once it is established.
