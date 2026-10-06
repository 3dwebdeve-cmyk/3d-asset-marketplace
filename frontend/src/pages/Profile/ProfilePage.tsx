import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { getProfile } from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { useChangePasswordForm } from '../Dashboard/useChangePasswordForm'
import { AVATAR_ALLOWED_EXTENSIONS, AVATAR_MAX_BYTES } from './avatarRules'
import { useAvatarUpload } from './useAvatarUpload'
import { useProfileForm } from './useProfileForm'

function DefaultAvatarSvg() {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#f97316" />
      <path
        d="M50 20C42 20 36 26 36 34C36 42 42 48 50 48C58 48 64 42 64 34C64 26 58 20 50 20Z"
        fill="#ffedd5"
      />
      <path
        d="M50 24C44.5 24 40 28.5 40 34C40 39.5 44.5 44 50 44C55.5 44 60 39.5 60 34C60 28.5 55.5 24 50 24Z"
        fill="#fed7aa"
      />
      <path
        d="M42 22C42 20 45 18 50 18C55 18 58 20 58 22C56 22 54 24 50 24C46 24 44 22 42 22Z"
        fill="#7c2d12"
      />
      <path d="M30 76C30 60 38 52 50 52C62 52 70 60 70 76V82H30V76Z" fill="#ffedd5" />
      <path d="M50 52L44 64H56L50 52Z" fill="#ea580c" />
    </svg>
  )
}

export function ProfilePage() {
  const profileQuery = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: getProfile,
  })

  const { register, handleSubmit, errors, isSubmitting, isDirty, serverError, onSubmit } =
    useProfileForm(profileQuery.data)

  const {
    selectedFile,
    previewUrl,
    clientError,
    serverError: avatarServerError,
    isUploading,
    isRemoving,
    onFileChange,
    onUpload,
    onRemove,
  } = useAvatarUpload(profileQuery.data)

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    errors: passwordErrors,
    isSubmitting: isPasswordSubmitting,
    serverError: passwordServerError,
    onSubmit: onPasswordSubmit,
  } = useChangePasswordForm()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputId = useId()
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const avatarError = clientError ?? avatarServerError
  const maxMb = AVATAR_MAX_BYTES / (1024 * 1024)
  const profile = profileQuery.data

  return (
    <main className="profile-edit-body" aria-labelledby="profile-title">
      <h1 id="profile-title" className="page-title">
        Edit your personal profile
      </h1>

      {profileQuery.isLoading ? (
        <Spinner label="Loading your profile..." />
      ) : profileQuery.isError ? (
        <ErrorState
          title="Could not load your profile"
          description="We could not load your profile details. Please try again."
          action={
            <Button
              variant="secondary"
              isLoading={profileQuery.isFetching}
              onClick={() => profileQuery.refetch()}
            >
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <form
            className="profile-form"
            onSubmit={handleSubmit((values) => {
              if (isDirty) {
                onSubmit(values)
              }
              if (selectedFile) {
                onUpload()
              }
            })}
            noValidate
            id="profileForm"
          >
            {serverError ? (
              <div className="profile-alerts">
                <Alert variant="error" message={serverError} />
              </div>
            ) : null}

            <h2 className="section-title">Profile information</h2>

            <div className="avatar-row">
              <div className="avatar-thumb">
                {previewUrl ? <img src={previewUrl} alt="" /> : <DefaultAvatarSvg />}
              </div>
              <div className="avatar-info-col">
                <button
                  type="button"
                  className="btn-upload-picture"
                  disabled={isUploading || isRemoving}
                  onClick={() => {
                    if (selectedFile) {
                      onUpload()
                      return
                    }
                    fileInputRef.current?.click()
                  }}
                >
                  {isUploading
                    ? 'Uploading…'
                    : selectedFile
                      ? 'Upload selected'
                      : 'Upload new picture'}
                </button>
                <span className="avatar-specs-text">
                  JPG or PNG and {maxMb}MB max
                </span>
                {selectedFile ? (
                  <span className="avatar-specs-text">{selectedFile.name}</span>
                ) : null}
                {profile?.avatar ? (
                  <button
                    type="button"
                    className="btn-remove-picture"
                    disabled={isUploading || isRemoving}
                    onClick={onRemove}
                  >
                    {isRemoving ? 'Removing…' : 'Remove picture'}
                  </button>
                ) : null}
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept={AVATAR_ALLOWED_EXTENSIONS.join(',')}
                  onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            {avatarError ? (
              <p className="form-error-text" role="alert" style={{ marginBottom: 18 }}>
                {avatarError}
              </p>
            ) : null}

            <div className="form-row">
              <label className="form-label" htmlFor="profile-email">
                Username
              </label>
              <div className="form-control-wrap">
                <div className="username-input-group">
                  <input
                    type="text"
                    id="profile-email"
                    className="form-input input-username-readonly"
                    value={profile?.email ?? ''}
                    readOnly
                    aria-readonly="true"
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="profile-display-name">
                Display name
              </label>
              <div className="form-control-wrap">
                <input
                  type="text"
                  id="profile-display-name"
                  className="form-input"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.full_name)}
                  {...register('full_name')}
                />
                {errors.full_name ? (
                  <span className="form-error-text" role="alert">{errors.full_name.message}</span>
                ) : null}
                <span className="form-helper-text">
                  This is the name that people will see when they visit your public profile.
                </span>
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="company_name">
                Company
              </label>
              <div className="form-control-wrap">
                <input
                  id="company_name"
                  className="form-input"
                  type="text"
                  autoComplete="organization"
                  aria-invalid={Boolean(errors.company_name)}
                  {...register('company_name')}
                />
                {errors.company_name ? (
                  <span className="form-error-text" role="alert">
                    {errors.company_name.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="address">
                Address
              </label>
              <div className="form-control-wrap">
                <input
                  id="address"
                  className="form-input"
                  type="text"
                  autoComplete="street-address"
                  aria-invalid={Boolean(errors.address)}
                  {...register('address')}
                />
                {errors.address ? (
                  <span className="form-error-text" role="alert">
                    {errors.address.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="city">
                City
              </label>
              <div className="form-control-wrap">
                <input
                  id="city"
                  className="form-input"
                  type="text"
                  autoComplete="address-level2"
                  aria-invalid={Boolean(errors.city)}
                  {...register('city')}
                />
                {errors.city ? (
                  <span className="form-error-text" role="alert">
                    {errors.city.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="country">
                Your location
              </label>
              <div className="form-control-wrap">
                <input
                  id="country"
                  className="form-input"
                  type="text"
                  autoComplete="country-name"
                  aria-invalid={Boolean(errors.country)}
                  {...register('country')}
                />
                {errors.country ? (
                  <span className="form-error-text" role="alert">
                    {errors.country.message}
                  </span>
                ) : null}
              </div>
            </div>

            <h2 className="section-title links-section">Links</h2>

            <div className="form-row">
              <label className="form-label" htmlFor="website">
                Personal website
              </label>
              <div className="form-control-wrap">
                <input
                  id="website"
                  className="form-input"
                  type="url"
                  autoComplete="url"
                  placeholder="https://example.org"
                  aria-invalid={Boolean(errors.website)}
                  {...register('website')}
                />
                {errors.website ? (
                  <span className="form-error-text" role="alert">
                    {errors.website.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-bottom-actions">
              <button
                type="submit"
                className="btn-save-changes"
                disabled={isSubmitting || isUploading || (!isDirty && !selectedFile)}
              >
                {isSubmitting ? 'Please wait…' : 'Save changes'}
              </button>
              <Link className="btn-cancel" to="/dashboard">
                Cancel
              </Link>
            </div>
          </form>

          <form
            className="profile-form"
            onSubmit={handlePasswordSubmit(onPasswordSubmit)}
            noValidate
            aria-label="Change password"
          >
            <h2 className="section-title links-section" id="passwordSection">
              Change Password
            </h2>

            {passwordServerError && Object.keys(passwordErrors).length === 0 ? (
              <div className="profile-alerts">
                <Alert variant="error" message={passwordServerError} />
              </div>
            ) : null}

            <div className="form-row">
              <label className="form-label" htmlFor="current_password">
                Current password
              </label>
              <div className="form-control-wrap">
                <input
                  id="current_password"
                  className="form-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  aria-invalid={Boolean(passwordErrors.current_password)}
                  {...registerPassword('current_password')}
                />
                {passwordErrors.current_password ? (
                  <span className="form-error-text form-error-text--danger" role="alert">
                    {passwordErrors.current_password.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="new_password">
                New password
              </label>
              <div className="form-control-wrap">
                <div className="profile-password-input">
                  <input
                    id="new_password"
                    className="form-input"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    aria-invalid={Boolean(passwordErrors.new_password)}
                    {...registerPassword('new_password')}
                  />
                  <button
                    type="button"
                    className="profile-password-input__toggle"
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    aria-pressed={showNewPassword}
                    onClick={() => setShowNewPassword((visible) => !visible)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                      {showNewPassword ? <path d="M4 20 20 4" /> : null}
                    </svg>
                  </button>
                </div>
                {passwordErrors.new_password ? (
                  <span className="form-error-text" role="alert">
                    {passwordErrors.new_password.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="new_password_confirm">
                Confirm password
              </label>
              <div className="form-control-wrap">
                <div className="profile-password-input">
                  <input
                    id="new_password_confirm"
                    className="form-input"
                    type={showPasswordConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    aria-invalid={Boolean(passwordErrors.new_password_confirm)}
                    {...registerPassword('new_password_confirm')}
                  />
                  <button
                    type="button"
                    className="profile-password-input__toggle"
                    aria-label={showPasswordConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    aria-pressed={showPasswordConfirm}
                    onClick={() => setShowPasswordConfirm((visible) => !visible)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                      {showPasswordConfirm ? <path d="M4 20 20 4" /> : null}
                    </svg>
                  </button>
                </div>
                {passwordErrors.new_password_confirm ? (
                  <span className="form-error-text" role="alert">
                    {passwordErrors.new_password_confirm.message}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="form-bottom-actions">
              <button
                type="submit"
                className="btn-save-changes"
                disabled={isPasswordSubmitting}
              >
                {isPasswordSubmitting ? 'Please wait…' : 'Update password'}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  )
}
