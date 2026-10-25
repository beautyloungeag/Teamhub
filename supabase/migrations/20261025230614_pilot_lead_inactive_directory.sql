-- Studio leads can find and reactivate their own inactive non-office profiles.
-- Ordinary directory readers still see active staff only; extra-studio overlap
-- on the target does not grant management of its foreign primary studio.
alter policy employees_read on public.employees using (
  public.is_staff() and (
    active or public.is_buero()
    or (public.is_lead() and app_role <> 'buero' and branch_id <> 'buero'
      and branch_id = any(public.my_branches()))
  )
);
