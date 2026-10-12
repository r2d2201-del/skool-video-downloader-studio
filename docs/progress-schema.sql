-- Apply to the dedicated Cinematic LMS Studio Supabase project only.
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null check (length(course_id) between 1 and 200),
  lesson_id text not null check (length(lesson_id) between 1 and 200),
  completed boolean not null,
  version bigint not null default 1 check (version > 0),
  mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, lesson_id)
);
alter table public.lesson_progress enable row level security;
revoke all on public.lesson_progress from anon;
grant select, insert, update on public.lesson_progress to authenticated;
revoke delete, truncate, references, trigger on public.lesson_progress from authenticated;
create policy "Read own progress" on public.lesson_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own progress" on public.lesson_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own progress" on public.lesson_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Compare-and-set by server revision, not by the client's wall clock. False
-- records are retained so an old browser import cannot resurrect a completion.
create function public.set_lesson_progress(
  p_course text, p_lesson text, p_completed boolean, p_version bigint,
  p_mutation uuid, p_import boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.lesson_progress;
  v_applied boolean := false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_version is null or p_version < 0 or p_mutation is null or p_import is null or p_completed is null
     or p_course is null or length(p_course) not between 1 and 200
     or p_lesson is null or length(p_lesson) not between 1 and 200 then
    raise exception 'Invalid progress change' using errcode = '22023';
  end if;
  if p_version = 0 or p_import then
    insert into public.lesson_progress(user_id, course_id, lesson_id, completed, mutation_id)
      values(v_user, p_course, p_lesson, p_completed, p_mutation)
      on conflict (user_id, course_id, lesson_id) do nothing returning * into v_row;
    v_applied := found;
  end if;
  if not v_applied and not p_import then
    update public.lesson_progress set completed = p_completed, version = version + 1,
      mutation_id = p_mutation, updated_at = clock_timestamp()
      where user_id = v_user and course_id = p_course and lesson_id = p_lesson
        and version = p_version and mutation_id <> p_mutation returning * into v_row;
    v_applied := found;
  end if;
  if not v_applied then
    select * into v_row from public.lesson_progress
      where user_id = v_user and course_id = p_course and lesson_id = p_lesson;
    if not found then raise exception 'Progress record missing; refresh and retry' using errcode = '40001'; end if;
    v_applied := v_row.mutation_id = p_mutation;
  end if;
  return jsonb_build_object('applied', v_applied, 'row', to_jsonb(v_row) - 'user_id');
end;
$$;
revoke all on function public.set_lesson_progress(text, text, boolean, bigint, uuid, boolean) from public, anon;
grant execute on function public.set_lesson_progress(text, text, boolean, bigint, uuid, boolean) to authenticated;
