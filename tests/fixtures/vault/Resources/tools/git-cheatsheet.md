# Git cheatsheet

## Undo

```sh
# discard local changes to one file
git restore path/to/file
# unstage a file but keep the changes
git restore --staged path/to/file
# move the branch back one commit, keeping changes in the working tree
git reset --soft HEAD~1
```

## Branches

```sh
# create and switch to a new branch
git switch -c feat/my-change
# delete a merged branch
git branch -d feat/my-change
```

## Finding things

- `git log -S "RepoWriter"` finds commits that added or removed that string.
- `git bisect` finds the commit that introduced a bug by binary search.
- `git blame -w` ignores whitespace changes when looking for the author of a line.
