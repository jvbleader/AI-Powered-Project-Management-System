"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { StatusPill } from "@/components/ui";
import { updateSessionCurrentUser } from "@/services/auth/session";
import { workspaceApi, userApi } from "@/services/api";
import { useAuthSession } from "@/hooks/use-session";
import type { UserProfile, WorkspaceShellData } from "@/types";
import { ProfileHero } from "./_components/profile-hero";
import { PersonalInfo } from "./_components/personal-info";

import styles from "./styles/profile.module.css";

export default function ProfilePage() {
  const session = useAuthSession();
  const currentActor = useMemo(() => session?.currentUser as UserProfile, [session?.currentUser]);
  const [shellData, setShellData] = useState<WorkspaceShellData>({
    currentUser: currentActor,
    activeProjects: 0,
    openTasks: 0,
    missingLogwork: 0,
    alertCount: 0,
  });
  const [profile, setProfile] = useState<UserProfile>(currentActor);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadPageData() {
      try {
        const [{ data: nextShellData }, { data: nextProfile }] = await Promise.all([
          workspaceApi.getShellData(currentActor),
          userApi.getCurrentProfile(currentActor),
        ]);

        if (isCancelled) {
          return;
        }

        setShellData(nextShellData);
        setProfile(nextProfile);
      } finally {
        if (!isCancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadPageData();

    return () => {
      isCancelled = true;
    };
  }, [currentActor]);

  function syncCurrentUser(nextUser: UserProfile) {
    setProfile(nextUser);
    updateSessionCurrentUser({
      ...currentActor,
      ...nextUser,
    });
  }

  const activeUser = profile;
  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Hồ sơ cá nhân"
      subheading="Xem và quản lý thông tin tài khoản của bạn."
      highlightLabel="Profile"
      highlightValue={activeUser?.employeeCode ?? "PERSONAL"}
    >
      <div className={styles.profilePage}>
        {activeUser && <ProfileHero user={activeUser} onUpdate={syncCurrentUser} />}

        <div className={styles.detailsColumn}>
          {activeUser && <PersonalInfo user={activeUser} onUpdate={syncCurrentUser} />}
        </div>
      </div>
    </WorkspaceShell>
  );
}
