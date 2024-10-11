# Dobuki Directory Generator

Note: This Github action was originally copied from a hello world, so it has a lot of junk.
That way, it's very simple to use and works fine for what it needs to do.

## What does it do

This just lists all files in your repo, and puts them into a "dir.json" file at the root.

## Why is it useful

If you setup a Github pages, you don't have a server that can go through and list all the files in your directory.
By having this list auto-generated dir.json, you can easily make a static website that reference to your files as they get added into your repo automatically.

See this [dir.json](https://jacklehamster.github.io/hello-world-javascript-action/directory/dir.json)

## Usage

Just look at one example where it's used:
[https://github.com/jacklehamster/power-troll-levels/blob/main/.github/workflows/main.yml](https://github.com/jacklehamster/hello-world-javascript-action/blob/master/.github/workflows/main.yml)
