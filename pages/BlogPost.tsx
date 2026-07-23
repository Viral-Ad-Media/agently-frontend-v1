import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BlogContent from "../components/BlogContent";
import { blogApi, type BlogPost as BlogPostType } from "../services/blogApi";

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

const BlogPost: React.FC = () => {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    blogApi
      .get(slug)
      .then((row) => active && setPost(row))
      .catch(
        (err) =>
          active &&
          setError(err instanceof Error ? err.message : "Article not found."),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="marketing-page min-h-[70vh] bg-white">
        <div className="marketing-shell py-20">
          <div className="mx-auto h-[36rem] max-w-4xl animate-pulse rounded-[2rem] bg-slate-900/5" />
        </div>
      </div>
    );
  }

  if (!post || error) {
    return (
      <div className="marketing-page min-h-[70vh] bg-white">
        <div className="marketing-shell py-20 text-center">
          <p className="text-sm text-slate-500">
            {error || "Article not found."}
          </p>
          <Link
            to="/blog"
            className="marketing-button-primary mt-6 inline-flex"
          >
            Back to the journal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <article className="marketing-page bg-white">
      <header className="border-b border-slate-900/10">
        <div className="marketing-shell py-12 sm:py-16 lg:py-20">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 transition hover:text-[#0F172A]"
          >
            ← Agently Journal
          </Link>
          <div className="mt-8 max-w-4xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#B45309]">
              {formatDate(post.publishedAt)} · {post.authorName}
            </p>
            <h1 className="mt-5 text-[clamp(1.85rem,3.6vw,2.9rem)] font-medium leading-[1.08] tracking-[-0.045em] text-[#0F172A]">
              {post.title}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.6] text-slate-600">
              {post.excerpt}
            </p>
          </div>
        </div>
      </header>

      {post.coverImageUrl ? (
        <div className="marketing-shell pt-8 sm:pt-10">
          <div className="overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[#0F172A] shadow-[0_28px_90px_rgba(5,8,23,0.16)]">
            <img
              src={post.coverImageUrl}
              alt=""
              className="aspect-[16/8.5] w-full object-cover"
            />
          </div>
        </div>
      ) : null}

      <div className="marketing-shell py-12 sm:py-16 lg:py-20">
        <BlogContent
          blocks={post.contentBlocks || []}
          templateKey={post.templateKey}
        />
      </div>
    </article>
  );
};

export default BlogPost;
