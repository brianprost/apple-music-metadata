import search from "./search.ts";

// const url = Deno.args[0];
const url = "https://music.apple.com/us/playlist/office-dj/pl.f820ed7063f9447f8751abf885525698";
const result = await search(url);
if (result) {
    console.log(JSON.stringify(result, null, 2));
}
