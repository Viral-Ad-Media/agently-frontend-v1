import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { blogApi, type BlogPost } from "../services/blogApi";

const formatDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const Blog: React.FC = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    blogApi
      .list(24)
      .then((rows) => active && setPosts(rows))
      .catch(
        (err) =>
          active &&
          setError(
            err instanceof Error ? err.message : "Unable to load updates.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const featured = posts[0];
  const remaining = posts.slice(1);

  return (
    <div className="marketing-page">
      <section className="border-b border-slate-900/10 bg-white">
        <div className="marketing-shell py-14 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="marketing-eyebrow mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              Agently Journal
            </div>
            <h1 className="marketing-page-title">
              Product news, practical guides, and the thinking behind better
              customer conversations.
            </h1>
            <p className="marketing-copy mt-5 max-w-2xl">
              Follow new Agently releases, operating advice, and clear ideas for
              building faster, more reliable customer experiences.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F1F5F9]">
        <div className="marketing-shell py-12 lg:py-16">
          {loading ? (
            <div className="grid gap-5 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-80 animate-pulse rounded-[1.75rem] bg-white/70"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-[1.75rem] border border-slate-900/10 bg-white p-8 text-sm text-slate-600">
              {error}
            </div>
          ) : !featured ? (
            <div className="rounded-[1.75rem] border border-slate-900/10 bg-white p-10 text-center">
              <h2 className="text-2xl font-medium text-[#0F172A]">
                The first update is on the way.
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                New Agently articles will appear here as soon as they are
                published.
              </p>
            </div>
          ) : (
            <>
              <Link
                to={`/blog/${featured.slug}`}
                className="group grid overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[#0F172A] text-white shadow-[0_28px_80px_rgba(5,8,23,0.15)] lg:grid-cols-[1.08fr_0.92fr]"
              >
                <div className="relative min-h-[300px] overflow-hidden bg-white/5 lg:min-h-[430px]">
                  {featured.coverImageUrl ? (
                    <img
                      src={featured.coverImageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,.38),transparent_40%),linear-gradient(135deg,#0F172A,#1E293B)]" />
                  )}
                </div>
                <div className="flex flex-col justify-between p-7 sm:p-9 lg:p-11">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#F59E0B]">
                      Latest update
                    </p>
                    <h2 className="mt-5 text-[clamp(2rem,4vw,3.9rem)] font-medium leading-[0.98] tracking-[-0.065em]">
                      {featured.title}
                    </h2>
                    <p className="mt-5 max-w-xl text-base leading-7 text-white/65">
                      {featured.excerpt}
                    </p>
                  </div>
                  <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/12 pt-5 text-xs text-white/50">
                    <span>{formatDate(featured.publishedAt)}</span>
                    <span className="inline-flex items-center gap-2 text-white">
                      Read article <span aria-hidden="true">↗</span>
                    </span>
                  </div>
                </div>
              </Link>

              {remaining.length ? (
                <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {remaining.map((post) => (
                    <Link
                      key={post.id}
                      to={`/blog/${post.slug}`}
                      className="group overflow-hidden rounded-[1.75rem] border border-slate-900/10 bg-white transition hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(5,8,23,0.10)]"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-slate-900/5">
                        {post.coverImageUrl ? (
                          <img
                            src={post.coverImageUrl}
                            alt=""
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full bg-[linear-gradient(135deg,#0F172A,#F59E0B)]" />
                        )}
                      </div>
                      <div className="p-6">
                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#0F172A]/45">
                          {formatDate(post.publishedAt)}
                        </p>
                        <h3 className="mt-3 text-xl font-medium leading-tight tracking-[-0.05em] text-[#0F172A]">
                          {post.title}
                        </h3>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                          {post.excerpt}
                        </p>
                        <p className="mt-5 text-sm font-medium text-[#B45309]">
                          Read more →
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default Blog;
