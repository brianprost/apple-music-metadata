import * as cheerio from "npm:cheerio";

const debugPrefix = "apple music: ";
let debug = false;

export function EnableDebug() {
  debug = true;
}

export interface Artist {
  name: string;
  url: string;
}

export interface Track {
  artist: Artist;
  duration: number;
  title: string;
  url: string;
  type: "song";
}

export interface RawAlbum {
  artist: Artist;
  description: string;
  numTracks: number;
  title: string;
  tracks: Track[];
  type: "album";
}

export interface RawPlaylist {
  creator: Artist;
  description: string;
  numTracks: number;
  title: string;
  tracks: Track[];
  type: "playlist";
}

function getRawPlaylist(document: string): RawPlaylist {
  const $ = cheerio.load(document);

  const tracks: Track[] = [];

  const songList = $("div.songs-list-row").toArray();
  songList.forEach((song: cheerio.Element) => {
    const lookArtist = $(song)
      .find("div.songs-list__col--artist")
      .find("a.songs-list-row__link");

    const track: Track = {
      artist: {
        name: lookArtist.text(),
        url: lookArtist.attr("href") ?? "",
      },
      title: $(song)
        .find("div.songs-list__col--song")
        .find("div.songs-list-row__song-name")
        .text(),
      duration: $(song)
        .find("div.songs-list__col--time")
        .find("time")
        .text()
        .trim()
        .split(":")
        .map((value: string): number => Number(value))
        .reduce((acc: number, time: number): number => 60 * acc + time),
      url:
        $(song)
          .find("div.songs-list__col--album")
          .find("a.songs-list-row__link")
          .attr("href") ?? "",
      type: "song",
    };

    tracks.push(track);
  });

  const product = $("div.product-page-header");
  const creator = product.find("div.product-creator").find("a.dt-link-to");

  const playlist: RawPlaylist = {
    title: product.find("h1.product-name").text().trim(),
    description: product
      .find("div.product-page-header__metadata--notes")
      .text()
      .trim(),
    creator: {
      name: creator.text().trim(),
      url: "https://music.apple.com" + (creator.attr("href") ?? ""),
    },
    tracks,
    numTracks: tracks.length,
    type: "playlist",
  };
  return playlist;
}

function getRawAlbum(document: string): RawAlbum {
  const $ = cheerio.load(document);

  const tracks: Track[] = [];

  const product = $("div.product-page-header");
  const creator = product.find("div.product-creator").find("a.dt-link-to");
  const artist = {
    name: creator.text().trim(),
    url: creator.attr("href") ?? "",
  };

  const albumUrl = $("meta[property='og:url']").attr("content");
  const songList = $("div.songs-list-row").toArray();
  songList.forEach((song: cheerio.Element) => {
    const track: Track = {
      artist,
      title: $(song)
        .find("div.songs-list__col--song")
        .find("div.songs-list-row__song-name")
        .text(),
      duration: $(song)
        .find("div.songs-list__col--time")
        .find("time")
        .text()
        .trim()
        .split(":")
        .map((value: string): number => Number(value))
        .reduce((acc: number, time: number): number => 60 * acc + time),
      url: albumUrl
        ? albumUrl +
            "?i=" +
            JSON.parse(
              $(song)
                .find("div.songs-list__col--time")
                .find("button.preview-button")
                .attr("data-metrics-click") ?? "{ \"targetId\": 0 }"
            )["targetId"]
        : "",
      type: "song",
    };

    tracks.push(track);
  });

  const playlist: RawAlbum = {
    title: product.find("h1.product-name").text().trim(),
    description: product
      .find("div.product-page-header__metadata--notes")
      .text()
      .trim(),
    artist,
    tracks,
    numTracks: tracks.length,
    type: "album",
  };
  return playlist;
}

function linkType(url: string): "song" | "playlist" | "album" {
  if (
    RegExp(
      /https?:\/\/music\.apple\.com\/.+?\/album\/.+?\/.+?\?i=([0-9]+)/
    ).test(url)
  ) {
    return "song";
  } else if (
    RegExp(/https?:\/\/music\.apple\.com\/.+?\/playlist\//).test(url)
  ) {
    return "playlist";
  } else if (RegExp(/https?:\/\/music\.apple\.com\/.+?\/album\//).test(url)) {
    return "album";
  } else {
    throw Error("Apple Music link is invalid");
  }
}

async function search(
  url: string
): Promise<RawPlaylist | RawAlbum | Track | null> {
  const urlType = linkType(url);
  const page = await fetch(url)
    .then((res) => res.text())
    .catch(() => undefined);

  if (!page) {
    if (debug) {
      console.log(debugPrefix + "http request failed");
    }
    return null;
  }

  if (urlType === "playlist") {
    console.log("playlist");
    return getRawPlaylist(page);
  }

  const album = getRawAlbum(page);

  if (urlType === "album") {
    return album;
  }

  const match = new RegExp(
    /https?:\/\/music\.apple\.com\/.+?\/album\/.+?\/.+?\?i=([0-9]+)/
  ).exec(url);

  const id = match ? match[1] : undefined;
  if (!id) {
    if (debug) {
      console.log(debugPrefix + "failed to extract song id");
    }
    return null;
  }

  const track = album.tracks.find((track) => {
    return track.url.includes(`?i=${id}`);
  });

  if (!track) {
    if (debug) {
      console.log(debugPrefix + "track not found in album");
    }
    return null;
  }

  return track;
}

export default search;
